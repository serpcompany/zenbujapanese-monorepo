export type RateLimit = (key: string) => number | null

const minute = 60_000

export function perMinute(limit: number, now: () => number = Date.now): RateLimit {
  let window = 0
  let counts = new Map<string, number>()
  return key => {
    const time = now()
    const current = time - (time % minute)
    if (current !== window) {
      window = current
      counts = new Map()
    }
    const count = (counts.get(key) ?? 0) + 1
    counts.set(key, count)
    return count > limit ? Math.ceil((window + minute - time) / 1000) : null
  }
}
