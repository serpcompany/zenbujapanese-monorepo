import { cutText } from './text'

export const watchLimits = { textLength: 200, seconds: 10_000_000, comprehension: 1 } as const

export type WatchNumber = 'duration' | 'position' | 'comprehension'

const most: Record<WatchNumber, number> = {
  duration: watchLimits.seconds,
  position: watchLimits.seconds,
  comprehension: watchLimits.comprehension
}

export const watchNumbers = Object.keys(most) as WatchNumber[]

export function watchText(typed: string): string | null {
  const text = cutText(typed, watchLimits.textLength)
  return text === '' ? null : text
}

export const fitsTheWatch = (field: WatchNumber, value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= most[field]
