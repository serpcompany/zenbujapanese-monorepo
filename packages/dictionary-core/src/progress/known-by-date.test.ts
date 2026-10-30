import { describe, expect, test } from 'vitest'
import { knownByDate } from './known-by-date'
import type { ProgressDay } from './stats'

const taberu = '042e07f7052f611fed33ddddf37f55fd'
const miru = '7f490a9c9c0da94f4e9474f4efe74be1'
const eki = 'd49b2f3c5cbf3002ebf317043cbebdad'
const go = 'kanji:語'

const markedKnown = (...ids: string[]): ProgressDay => ({
  changes: ids.map((id, index) => ({ id, before: 'learning', after: 'known', at: index })),
  goal: 10,
  known: ids.length,
  learning: 0
})

const week = (days: Record<string, ProgressDay>, offset = 0, today = '2026-10-28') =>
  knownByDate({ days, today, week: offset })

const log = {
  '2026-10-03': markedKnown(eki),
  '2026-10-20': markedKnown(taberu, miru),
  '2026-10-26': markedKnown(miru, go),
  '2026-10-28': markedKnown(taberu)
}

describe('the words marked Known in a week', () => {
  test('this week is the 7 days ending today, each with its words and count', () => {
    const shown = week(log)
    expect(shown.days.map(day => day.day)).toEqual([
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
      '2026-10-28'
    ])
    expect(shown.days.at(-3)).toEqual({ day: '2026-10-26', markedKnown: [miru, go], count: 2 })
    expect(shown.days.at(-1)).toEqual({ day: '2026-10-28', markedKnown: [taberu], count: 1 })
    expect(shown.days[0]).toEqual({ day: '2026-10-22', markedKnown: [], count: 0 })
  })

  test('the total is the sum of the days, and the change is against the week before', () => {
    const shown = week(log)
    expect(shown.total).toBe(3)
    expect(shown.change).toBe(1)
    expect(week(log, 1)).toMatchObject({ total: 2, change: 2 })
  })

  test('an earlier week ends 7 days before, and the earliest holds the log’s first day', () => {
    expect(week(log, 1).days.map(day => day.day)).toEqual([
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
      '2026-10-19',
      '2026-10-20',
      '2026-10-21'
    ])
    expect(week(log, 2)).toMatchObject({ week: 2, hasEarlier: true, hasLater: true })
    const earliest = week(log, 3)
    expect(earliest).toMatchObject({ week: 3, hasEarlier: false, hasLater: true, total: 1 })
    expect(earliest.days[0]).toEqual({ day: '2026-10-01', markedKnown: [], count: 0 })
    expect(earliest.days[2]).toEqual({ day: '2026-10-03', markedKnown: [eki], count: 1 })
    expect(earliest.days.at(-1)?.day).toBe('2026-10-07')
  })

  test('the week before is left out when it lies wholly before the log began', () => {
    expect(week(log, 3).change).toBeNull()
    expect(week({ '2026-10-28': markedKnown(taberu) })).toMatchObject({
      total: 1,
      change: null,
      hasEarlier: false,
      hasLater: false,
      firstDay: '2026-10-28'
    })
  })

  test('days before the log began count zero, and a week offset past either end is held to it', () => {
    const earliest = week({ '2026-10-25': markedKnown(eki) }, 9)
    expect(earliest.week).toBe(0)
    expect(earliest.days.slice(0, 3).map(day => day.count)).toEqual([0, 0, 0])
    expect(week(log, -2).week).toBe(0)
  })

  test('the log’s first day is its first logged day', () => {
    expect(week(log).firstDay).toBe('2026-10-03')
    expect(week({}).firstDay).toBe('2026-10-28')
  })

  test('a word marked Known then moved back stays under the day it was marked Known', () => {
    const backAgain: ProgressDay = {
      changes: [
        { id: taberu, before: 'learning', after: 'known', at: 1 },
        { id: taberu, before: 'known', after: 'learning', at: 2 }
      ],
      goal: 10,
      known: 0,
      learning: 1
    }
    expect(week({ '2026-10-27': backAgain }).days.at(-2)?.markedKnown).toEqual([taberu])
  })
})
