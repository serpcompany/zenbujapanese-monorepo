import { dayName, dayNumber, type ProgressDay, progressStats } from './stats'

interface KnownByDateRequest {
  days: Readonly<Record<string, ProgressDay>>
  today: string
  week: number
}

interface KnownOnDay {
  day: string
  markedKnown: string[]
  count: number
}

interface KnownByDate {
  week: number
  days: KnownOnDay[]
  total: number
  change: number | null
  hasEarlier: boolean
  hasLater: boolean
  firstDay: string
}

const weekLength = 7

export function knownByDate(request: KnownByDateRequest): KnownByDate {
  const stats = progressStats({ days: request.days, goal: 0, today: request.today })
  const marked = new Map(stats.words.map(words => [words.day, words.markedKnown]))
  const firstDay = stats.days[0]?.day ?? request.today
  const today = dayNumber(request.today)
  const earliest = Math.floor((today - dayNumber(firstDay)) / weekLength)
  const week = Math.min(Math.max(0, Math.trunc(request.week) || 0), earliest)
  const daysOf = (shown: number) =>
    Array.from({ length: weekLength }, (_, index) => {
      const day = dayName(today - shown * weekLength - (weekLength - 1) + index)
      const ids = marked.get(day) ?? []
      return { day, markedKnown: ids, count: ids.length }
    })
  const totalOf = (days: readonly KnownOnDay[]) => days.reduce((sum, day) => sum + day.count, 0)
  const days = daysOf(week)
  const total = totalOf(days)
  const hasEarlier = week < earliest
  return {
    week,
    days,
    total,
    change: hasEarlier ? total - totalOf(daysOf(week + 1)) : null,
    hasEarlier,
    hasLater: week > 0,
    firstDay
  }
}
