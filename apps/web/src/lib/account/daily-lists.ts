import type { Shown } from '@zenbu/account-rules/account-views'
import { dailyListDay } from '@zenbu/account-rules/daily-lists'
import type { Locale } from '../i18n/config'

interface DailyList {
  list: Shown
  day: string
  title: string
}

export interface DailyGroup {
  heading: string
  lists: DailyList[]
}

export interface DayWords {
  thisWeek: string
  today: string
  yesterday: string
}

export const isDailyList = (entityId: string) => dailyListDay(entityId) !== null

export const ownLists = <T extends { entityId: string }>(lists: readonly T[]): T[] =>
  lists.filter(list => !isDailyList(list.entityId))

export function localDay(now: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(each => each.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

const dateOf = (day: string) => new Date(`${day}T00:00:00Z`)

function daysBefore(day: string, count: number): string {
  const date = dateOf(day)
  date.setUTCDate(date.getUTCDate() - count)
  return date.toISOString().slice(0, 10)
}

const formatted = (day: string, locale: Locale, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(dateOf(day))

function dayTitle(day: string, today: string, locale: Locale, words: DayWords): string {
  if (day === today) return words.today
  if (day === daysBefore(today, 1)) return words.yesterday
  return formatted(day, locale, { weekday: 'long', month: 'short', day: 'numeric' })
}

export function dailyListTitle(
  entityId: string,
  today: string,
  locale: Locale,
  words: DayWords
): string | null {
  const day = dailyListDay(entityId)
  return day === null ? null : dayTitle(day, today, locale, words)
}

const newestFirst = (one: DailyList, other: DailyList) =>
  one.day < other.day ? 1 : one.day > other.day ? -1 : 0

export function dailyListGroups(
  lists: readonly Shown[],
  today: string,
  locale: Locale,
  words: DayWords
): DailyGroup[] {
  const weekStart = daysBefore(today, 6)
  const daily = lists
    .flatMap(list => {
      const day = dailyListDay(list.entityId)
      return day === null ? [] : [{ list, day, title: dayTitle(day, today, locale, words) }]
    })
    .sort(newestFirst)
  const groups: DailyGroup[] = []
  for (const each of daily) {
    const heading =
      each.day >= weekStart
        ? words.thisWeek
        : formatted(each.day, locale, { month: 'long', year: 'numeric' })
    const last = groups.at(-1)
    if (last?.heading === heading) last.lists.push(each)
    else groups.push({ heading, lists: [each] })
  }
  return groups
}
