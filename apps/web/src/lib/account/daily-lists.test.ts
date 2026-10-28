import { dailyListId } from '@zenbu/account-rules/daily-lists'
import { dailyListIdCases as cases } from '@zenbu/account-rules/test/cases'
import { describe, expect, test } from 'vitest'
import { getDictionary } from '../i18n/dictionary'
import { dailyListGroups, dailyListTitle, isDailyList, localDay, ownLists } from './daily-lists'

const shown = (entityId: string) => ({ entityId, version: 1, data: { name: 'Stored name' } })
const dayId = (day: string) => dailyListId(day) ?? ''
const words = getDictionary('en').account.synced.lists
const grouped = (days: string[], today: string, locale: 'en' | 'ja' = 'en') =>
  dailyListGroups(
    days.map(day => shown(dayId(day))),
    today,
    locale,
    getDictionary(locale).account.synced.lists
  ).map(group => [group.heading, group.lists.map(each => each.title)])

describe("the website's daily lists", () => {
  test('read the day from each ID the shared cases name, and take no other ID for one', () => {
    for (const { covers, id, day } of [...cases.days, ...cases.upperCase]) {
      expect(isDailyList(id), covers).toBe(true)
      expect(ownLists([shown(id)]), covers).toEqual([])
      const [group] = dailyListGroups([shown(id)], day, 'en', words)
      expect(
        group?.lists.map(each => [each.day, each.title]),
        covers
      ).toEqual([[day, 'Today']])
    }
    for (const { covers, id } of cases.notDailyLists) {
      expect(isDailyList(id), covers).toBe(false)
      expect(ownLists([shown(id)]), covers).toEqual([shown(id)])
      expect(dailyListGroups([shown(id)], '2026-10-28', 'en', words), covers).toEqual([])
    }
  })

  test('group this week, a later day and the six before today, then each month, newest first', () => {
    const days = [
      '2026-09-30',
      '2026-10-21',
      '2026-10-22',
      '2026-10-28',
      '2026-10-29',
      '2026-10-27'
    ]
    expect(grouped(days, '2026-10-28')).toEqual([
      ['This week', ['Thursday, Oct 29', 'Today', 'Yesterday', 'Thursday, Oct 22']],
      ['October 2026', ['Wednesday, Oct 21']],
      ['September 2026', ['Wednesday, Sep 30']]
    ])
  })

  test("title each day and month in the reader's language", () => {
    expect(
      grouped(['2026-10-26', '2026-10-27', '2026-10-28', '2025-12-31'], '2026-10-28', 'ja')
    ).toEqual([
      ['今週', ['今日', '昨日', '10月26日月曜日']],
      ['2025年12月', ['12月31日水曜日']]
    ])
  })

  test("read today in the browser's own time zone, not UTC's", () => {
    const lateInUtc = new Date('2026-01-05T23:30:00Z')
    expect(localDay(lateInUtc, 'UTC')).toBe('2026-01-05')
    expect(localDay(lateInUtc, 'Asia/Tokyo')).toBe('2026-01-06')
    const earlyInUtc = new Date('2026-01-01T02:00:00Z')
    expect(localDay(earlyInUtc, 'America/Los_Angeles')).toBe('2025-12-31')
    expect(localDay(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31')
  })

  test('title a daily list by its day, and give an own list no day title', () => {
    expect(dailyListTitle(dayId('2026-10-27'), '2026-10-28', 'en', words)).toBe('Yesterday')
    expect(dailyListTitle(dayId('2026-10-20'), '2026-10-28', 'en', words)).toBe('Tuesday, Oct 20')
    expect(dailyListTitle(crypto.randomUUID(), '2026-10-28', 'en', words)).toBeNull()
  })
})
