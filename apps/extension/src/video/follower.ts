import type { Caption } from '@zenbu/dictionary-core/captions/lines'

export type Playback = {
  videoId: string
  time: number
  playing: boolean
  rate: number
  ad: boolean
}

export interface VideoFollower {
  readonly playback: Playback | null
  subscribe(listener: (playback: Playback | null) => void): () => void
  seek(time: number): void
  play(): void
  pause(): void
  setRate(rate: number): void
  captionHost(): HTMLElement | null
  showSiteCaptions(shown: boolean): void
  stop(): void
}

export function currentLine(lines: readonly Caption[], time: number): number | null {
  let low = 0
  let high = lines.length - 1
  while (low <= high) {
    const middle = (low + high) >>> 1
    const line = lines[middle]
    if (time < line.start) high = middle - 1
    else if (time >= line.end) low = middle + 1
    else return middle
  }
  return null
}

export function playingLine(lines: readonly Caption[], playback: Playback | null): number | null {
  return playback && !playback.ad ? currentLine(lines, playback.time) : null
}
