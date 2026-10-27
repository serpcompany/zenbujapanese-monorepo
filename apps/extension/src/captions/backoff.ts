const minute = 60_000

export const rateLimitWaits = [15 * minute, 30 * minute, 60 * minute]

export const rateLimitJitter = 0.2

export type RateLimit = { retryAt: number; strikes: number }

export function nextRateLimit(
  previous: RateLimit | undefined,
  now: number,
  random: () => number
): RateLimit {
  const strikes = (previous?.strikes ?? 0) + 1
  const wait = rateLimitWaits[Math.min(strikes, rateLimitWaits.length) - 1]
  return { strikes, retryAt: Math.round(now + wait * (1 + rateLimitJitter * random())) }
}
