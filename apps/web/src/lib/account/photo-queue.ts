import type { Result } from './client'

const photosAtOnce = 4

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
      return await download(photoId)
    } finally {
      next()
    }
  }
}
