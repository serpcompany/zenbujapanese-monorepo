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

export type Watch = [unknown, unknown, unknown, unknown, unknown]
type SentWatch = [string | null, string | null, number | null, number | null, number | null]

const sentText = (value: unknown) => (typeof value === 'string' ? watchText(value) : null)

const sentWatch = ([title, author, duration, position, comprehension]: Watch): SentWatch => [
  sentText(title),
  sentText(author),
  fitsTheWatch('duration', duration) ? duration : null,
  fitsTheWatch('position', position) ? position : null,
  fitsTheWatch('comprehension', comprehension) ? comprehension : null
]

export function sentWatchMarks(watches: readonly Watch[]): string {
  const replaced: string[] = []
  let marks = ''
  for (const watch of watches) {
    const sent = sentWatch(watch)
    for (let field = 0; field < sent.length; field += 1) {
      const value = sent[field]
      if (value === null) marks += '-'
      else if (value === watch[field]) marks += 'k'
      else {
        marks += 'r'
        replaced.push(String(value))
      }
    }
  }
  return replaced.length === 0 ? marks : `${marks}\n${JSON.stringify(replaced)}`
}
