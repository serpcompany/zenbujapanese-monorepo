import type { Result } from './client'

const photosAtOnce = 4
const longestWaitSeconds = 60

function secondsToWait(result: Result<Blob>): number | null {
  if (result.ok || result.failure.kind !== 'refused' || result.failure.status !== 429) return null
  return Math.min(result.failure.retryAfter ?? 1, longestWaitSeconds)
}

export function photoQueue(
  download: (photoId: string) => Promise<Result<Blob>>,
  atOnce: number = photosAtOnce
) {
  let running = 0
  const waiting: (() => void)[] = []
  const next = () => {
    running -= 1
    waiting.shift()?.()
  }
  return async function load(photoId: string): Promise<Result<Blob>> {
    if (running >= atOnce) await new Promise<void>(resolve => waiting.push(resolve))
    running += 1
    try {
      const first = await download(photoId)
      const wait = secondsToWait(first)
      if (wait === null) return first
      await new Promise(resolve => setTimeout(resolve, wait * 1000))
      return await download(photoId)
    } finally {
      next()
    }
  }
}
