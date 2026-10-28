import { describe, expect, test } from 'vitest'
import { type ProgressChange, type ProgressDay, progressStats } from './stats'

const taberu = '042e07f7052f611fed33ddddf37f55fd'
const miru = '7f490a9c9c0da94f4e9474f4efe74be1'
const eki = 'd49b2f3c5cbf3002ebf317043cbebdad'
const inu = '681bff8274391329f3ce9ca80a4e04b0'
const go = 'kanji:語'

const at = Date.UTC(2026, 9, 28, 9)

const change = (id: string, before: string, after: string): ProgressChange => ({
  id,
  before,
  after,
  at
})

const day = (changes: ProgressChange[], on: Partial<ProgressDay> = {}): ProgressDay => ({
  changes,
  goal: 1,
  known: 0,
  learning: 0,
  ...on
})

const learned = (...ids: string[]) => day(ids.map(id => change(id, 'unknown', 'learning')))

const stats = (days: Record<string, ProgressDay>, today = '2026-10-28', goal = 1) =>
  progressStats({ days, goal, today })

describe('words added to Learning on a day', () => {
  test('a word marked Learning counts once, even when marked again', () => {
    const today = stats({
      '2026-10-28': day([
        change(taberu, 'unknown', 'learning'),
        change(taberu, 'learning', 'unknown'),
        change(taberu, 'unknown', 'learning'),
        change(miru, 'unknown', 'learning')
      ])
    }).today
    expect(today.added).toBe(2)
    expect(stats({ '2026-10-28': learned(taberu, taberu) }).today.added).toBe(1)
  })

  test('a word marked Learning then set back to Unknown the same day does not count', () => {
    const changes = [change(taberu, 'unknown', 'learning'), change(taberu, 'learning', 'unknown')]
    expect(stats({ '2026-10-28': day(changes) }).today.added).toBe(0)
    const { words } = stats({ '2026-10-28': day(changes) })
    expect(words).toEqual([{ day: '2026-10-28', addedToLearning: [], markedKnown: [] }])
  })

  test('a word moved from Known to Learning does not count', () => {
    expect(stats({ '2026-10-28': day([change(taberu, 'known', 'learning')]) }).today.added).toBe(0)
  })

  test('kanji do not count toward the goal but do count as marked Known', () => {
    const result = stats({
      '2026-10-28': day([change(go, 'unknown', 'learning'), change(go, 'learning', 'known')])
    })
    expect(result.today).toMatchObject({ added: 0, markedKnown: 1, met: false })
    expect(result.words).toEqual([{ day: '2026-10-28', addedToLearning: [], markedKnown: [go] }])
  })

  test('lists each day’s words added to Learning and marked Known, by ID, in order', () => {
    const result = stats({
      '2026-10-27': learned(taberu, miru),
      '2026-10-28': day([change(eki, 'unknown', 'known'), change(taberu, 'learning', 'known')])
    })
    expect(result.words).toEqual([
      { day: '2026-10-27', addedToLearning: [taberu, miru], markedKnown: [] },
      { day: '2026-10-28', addedToLearning: [], markedKnown: [eki, taberu] }
    ])
  })
})

describe('the goal', () => {
  test('changing the goal leaves past days’ goals as they were', () => {
    const days = { '2026-10-26': learned(taberu), '2026-10-27': learned(miru) }
    const result = stats(days, '2026-10-28', 5)
    expect(result.days.map(({ day, goal, met }) => ({ day, goal, met }))).toEqual([
      { day: '2026-10-26', goal: 1, met: true },
      { day: '2026-10-27', goal: 1, met: true },
      { day: '2026-10-28', goal: 5, met: false }
    ])
    expect(result.today).toEqual({
      day: '2026-10-28',
      added: 0,
      markedKnown: 0,
      goal: 5,
      met: false
    })
  })

  test('a day the log skipped keeps the goal of the day before it', () => {
    const days = { '2026-10-25': day([], { goal: 3 }), '2026-10-27': day([], { goal: 4 }) }
    expect(stats(days).days.map(day => day.goal)).toEqual([3, 3, 4, 1])
  })
})

describe('streaks', () => {
  const met = {
    '2026-10-24': learned(taberu),
    '2026-10-25': learned(miru),
    '2026-10-26': learned(eki),
    '2026-10-27': learned(inu)
  }

  test('with today met, the streak ends today', () => {
    expect(stats({ ...met, '2026-10-28': learned(taberu) }).streak).toBe(5)
  })

  test('with today not yet met, the streak ends yesterday', () => {
    expect(stats(met).streak).toBe(4)
    expect(stats({ ...met, '2026-10-28': day([]) }).streak).toBe(4)
  })

  test('a day not met breaks the streak', () => {
    const { '2026-10-25': _, ...gap } = met
    expect(stats(gap).streak).toBe(2)
    expect(stats({ '2026-10-25': learned(taberu) }).streak).toBe(0)
  })

  test('the best streak is the longest run, with its first and last day', () => {
    const result = stats({
      '2026-10-20': learned(taberu),
      '2026-10-21': learned(miru),
      '2026-10-22': learned(eki),
      '2026-10-24': learned(inu),
      '2026-10-27': learned(taberu),
      '2026-10-28': learned(miru)
    })
    expect(result.bestStreak).toEqual({ length: 3, first: '2026-10-20', last: '2026-10-22' })
    expect(result.streak).toBe(2)
    expect(stats({}).bestStreak).toBeNull()
  })
})

describe('totals', () => {
  test('known over time keeps the day before’s total across days with no change', () => {
    const result = stats({
      '2026-10-24': day([], { known: 3, learning: 2 }),
      '2026-10-26': day([change(taberu, 'learning', 'known')], { known: 4, learning: 1 })
    })
    expect(result.knownOverTime).toEqual([
      { day: '2026-10-24', known: 3 },
      { day: '2026-10-25', known: 3 },
      { day: '2026-10-26', known: 4 },
      { day: '2026-10-27', known: 4 },
      { day: '2026-10-28', known: 4 }
    ])
    expect(result.totals).toEqual({ known: 4, learning: 1, markedKnownLast7: 1, addedLast7: 0 })
  })

  test('the last 7 and 30 days each give the day’s count and goal', () => {
    const result = stats({ '2026-09-01': learned(taberu), '2026-10-28': learned(miru, eki) })
    expect(result.last7.map(day => day.day)).toEqual([
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
      '2026-10-28'
    ])
    expect(result.last30).toHaveLength(30)
    expect(result.last30[0]?.day).toBe('2026-09-29')
    expect(result.today).toMatchObject({ added: 2, goal: 1, met: true })
    expect(result.totals.addedLast7).toBe(2)
  })
})

describe('the daily average', () => {
  test('averages the 7 days before today, not today', () => {
    const result = stats({
      '2026-10-20': learned(taberu, miru, eki, inu),
      '2026-10-21': learned(taberu, miru, eki),
      '2026-10-23': learned(taberu, miru, eki, inu),
      '2026-10-27': learned(taberu, miru, eki, inu),
      '2026-10-28': learned(taberu, miru, eki, inu)
    })
    expect(result.dailyAverage).toEqual({ average: 11 / 7, days: 7 })
  })

  test('with a shorter history, averages the days there are', () => {
    const days = { '2026-10-26': learned(taberu, miru, eki), '2026-10-27': learned(inu) }
    expect(stats(days).dailyAverage).toEqual({ average: 2, days: 2 })
    expect(stats({ '2026-10-28': learned(taberu) }).dailyAverage).toEqual({ average: 0, days: 0 })
  })
})
