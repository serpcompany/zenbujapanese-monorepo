import { log } from '@zenbu/node-service/log'
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { failureFields } from '../failure'
import type { AccountEnv } from './env'
import { errorBody } from './errors'

const windowMs = 60_000

export const requestsPerMinute = { profile: 60, sync: 120, subscription: 30, photos: 300 } as const

type Limited = Context<AccountEnv>

function perMinute(
  keyOf: (context: Limited) => string,
  limitOf: (context: Limited) => number,
  says: (limit: number) => string
) {
  let windowStart = 0
  let counts = new Map<string, number>()
  return createMiddleware<AccountEnv>(async (context, next) => {
    const now = Date.now()
    if (now - windowStart >= windowMs) {
      windowStart = now - (now % windowMs)
      counts = new Map()
    }
    const key = keyOf(context)
    const count = (counts.get(key) ?? 0) + 1
    counts.set(key, count)
    const limit = limitOf(context)
    if (count > limit) {
      const retryAfter = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000))
      return context.json(
        errorBody('too_many_requests', `${says(limit)} Try again in ${retryAfter} seconds.`),
        429,
        { 'Retry-After': String(retryAfter) }
      )
    }
    await next()
  })
}

export const perAccountLimit = (limit: number) =>
  perMinute(
    context => `${context.get('userId')}\u0000${context.get('clientId')}`,
    () => limit,
    most => `This account sent more than ${most} of these a minute from this app.`
  )

export const perClientLimit = (limitOf: (clientId: string) => number) =>
  perMinute(
    context => context.get('clientId'),
    context => limitOf(context.get('clientId')),
    most => `This app sent more than ${most} requests a minute, from every account together.`
  )

export const atOnce = {
  uploads: { service: 4, account: 2 },
  downloads: { service: 16, account: 4 }
} as const

function heldUntilSent(
  response: Response,
  body: ReadableStream<Uint8Array>,
  closed: AbortSignal,
  done: () => void
) {
  const reader = body.getReader()
  let sending: ReadableStreamDefaultController<Uint8Array> | null = null
  let stopped = false
  const stop = (reason: unknown) => {
    if (stopped) return
    stopped = true
    done()
    reader.cancel(reason).catch(() => {})
  }
  closed.addEventListener(
    'abort',
    () => {
      stop(closed.reason)
      sending?.error(closed.reason)
    },
    { once: true }
  )
  const sent = new ReadableStream<Uint8Array>({
    start(controller) {
      sending = controller
    },
    async pull(controller) {
      try {
        const read = await reader.read()
        if (stopped) return
        if (!read.done) return controller.enqueue(read.value)
        done()
        controller.close()
      } catch (error) {
        if (stopped) return
        stop(error)
        log('warn', 'a photo download was cut', failureFields(error))
        controller.error(error)
      }
    },
    cancel: reason => stop(reason)
  })
  return new Response(sent, response)
}

export function atMostAtOnce(most: { service: number; account: number }, untilSent = false) {
  let running = 0
  const byAccount = new Map<string, number>()
  return createMiddleware<AccountEnv>(async (context, next) => {
    const account = context.get('userId')
    const mine = byAccount.get(account) ?? 0
    if (running >= most.service || mine >= most.account) {
      return context.json(
        errorBody(
          'too_many_requests',
          `The service takes ${most.service} of these at once, and ${most.account} from one account. Try again.`
        ),
        429,
        { 'Retry-After': '1' }
      )
    }
    running++
    byAccount.set(account, mine + 1)
    let held = true
    const release = () => {
      if (!held) return
      held = false
      running--
      const left = (byAccount.get(account) ?? 1) - 1
      if (left > 0) byAccount.set(account, left)
      else byAccount.delete(account)
    }
    let sending = false
    try {
      await next()
      const body = context.res.body
      const closed = context.req.raw.signal
      if (untilSent && context.res.status === 200 && body) {
        if (context.req.method === 'HEAD' || closed.aborted) {
          context.res = new Response(null, context.res)
          await body.cancel()
        } else {
          context.res = heldUntilSent(context.res, body, closed, release)
          sending = true
        }
      }
    } finally {
      if (!sending) release()
    }
  })
}
