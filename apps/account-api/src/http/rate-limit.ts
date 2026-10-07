import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { AccountEnv } from './env'
import { errorBody } from './errors'

const windowMs = 60_000

export const requestsPerMinute = { profile: 60, sync: 120 } as const

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
