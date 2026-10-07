import { createMiddleware } from 'hono/factory'
import type { AccountEnv } from './env'
import { errorBody } from './errors'

const windowMs = 60_000

export const requestsPerMinute = { profile: 60, sync: 120 } as const

export function perAccountLimit(perMinute: number) {
  let windowStart = 0
  let counts = new Map<string, number>()
  return createMiddleware<AccountEnv>(async (context, next) => {
    const now = Date.now()
    if (now - windowStart >= windowMs) {
      windowStart = now - (now % windowMs)
      counts = new Map()
    }
    const userId = context.get('userId')
    const count = (counts.get(userId) ?? 0) + 1
    counts.set(userId, count)
    if (count > perMinute) {
      const retryAfter = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000))
      return context.json(
        errorBody(
          'too_many_requests',
          `This account sent more than ${perMinute} of these a minute. Try again in ${retryAfter} seconds.`
        ),
        429,
        { 'Retry-After': String(retryAfter) }
      )
    }
    await next()
  })
}
