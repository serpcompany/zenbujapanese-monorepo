import { describe, expect, test } from 'vitest'
import { type DatedChange, progressDays } from './days'
import { type ProgressDay, progressStats } from './stats'

const taberu = '042e07f7052f611fed33ddddf37f55fd'
const miru = '7f490a9c9c0da94f4e9474f4efe74be1'
const eki = 'd49b2f3c5cbf3002ebf317043cbebdad'
const nomu = '262ea7b4342d41837de1d4302b25b5a2'

const today = '2026-10-28'
const hour = 3_600_000

const change = (id: string, before: string, after: string, day: string, at = 9): DatedChange => ({
  id,
  before,
  after,
  at: Date.parse(`${day}T00:00:00Z`) + at * hour,
  day
})

const learned = (id: string, day: string, at = 9) => change(id, 'unknown', 'learning', day, at)

const day = (changes: DatedChange[], on: Partial<ProgressDay> = {}): ProgressDay => ({
  changes: changes.map(({ day: _day, ...logged }) => logged),
  goal: 20,
  known: 0,
  learning: 0,
  ...on
})

const fill = (
  changes: DatedChange[],
  totals: { known: number; learning: number },
  days: Record<string, ProgressDay> = {},
  goal = 20
) => progressDays({ days: { [today]: day([], totals), ...days }, changes, goal, today, totals })

describe('a new device’s first read', () => {
  const changes = [
    learned(taberu, '2026-10-26'),
    learned(miru, '2026-10-26', 10),
    learned(eki, '2026-10-27'),
    change(nomu, 'unknown', 'known', '2026-10-27', 10)
  ]

  test('fills each day from the words’ times, with the running counts and the goal at the fill', () => {
    expect(fill(changes, { known: 1, learning: 3 })).toEqual({
      '2026-10-26': day(changes.slice(0, 2), { learning: 2 }),
      '2026-10-27': day(changes.slice(2), { known: 1, learning: 3 })
    })
  })

  test('gives the streak of the days the words were added on', () => {
    const added = [...changes.slice(0, 3), learned(nomu, '2026-10-27', 10)]
    const totals = { known: 0, learning: 4 }
    const days = { [today]: day([], totals), ...fill(added, totals, {}, 2) }
    expect(progressStats({ days, goal: 2, today }).streak).toBe(2)
  })

  test('counts a word with no time toward every filled day’s totals and no day’s changes', () => {
    const filled = fill(changes.slice(0, 2), { known: 0, learning: 3 })
    expect(filled).toEqual({ '2026-10-26': day(changes.slice(0, 2), { learning: 3 }) })
  })
})

describe('a log the device already keeps', () => {
  test('a recorded day keeps its own totals and goal, and gains the changes made by its end', () => {
    const recorded = {
      '2026-10-26': day([learned(eki, '2026-10-26')], { goal: 3, learning: 1 }),
      '2026-10-27': day([learned(taberu, '2026-10-27')], { goal: 5, learning: 2 })
    }
    const synced = learned(miru, '2026-10-27', 8)
    expect(fill([synced], { known: 0, learning: 3 }, recorded)).toEqual({
      '2026-10-27': day([synced, learned(taberu, '2026-10-27')], { goal: 5, learning: 3 })
    })
  })

  test('a day between recorded days starts from the day before it and keeps its goal', () => {
    const recorded = {
      '2026-10-25': day([learned(eki, '2026-10-25')], { goal: 3, learning: 1 }),
      '2026-10-27': day([learned(taberu, '2026-10-27')], { goal: 5, learning: 2 })
    }
    const synced = learned(miru, '2026-10-26')
    expect(fill([synced], { known: 0, learning: 3 }, recorded)).toEqual({
      '2026-10-26': day([synced], { goal: 3, learning: 2 }),
      '2026-10-27': day([learned(taberu, '2026-10-27')], { goal: 5, learning: 3 })
    })
  })

  test('a synced change the device already recorded is not counted again', () => {
    const recorded = { '2026-10-27': day([learned(taberu, '2026-10-27')], { learning: 1 }) }
    const echoed = { ...learned(taberu, '2026-10-27'), at: learned(taberu, '2026-10-27').at + 0.4 }
    expect(fill([echoed], { known: 0, learning: 1 }, recorded)).toEqual({})
  })
})

describe('what counts', () => {
  test('a synced Unknown → Learning change counts on its day, and a Known → Learning one does not', () => {
    const changes = [learned(taberu, '2026-10-27'), change(miru, 'known', 'learning', '2026-10-27')]
    const filled = fill(changes, { known: 0, learning: 2 })
    expect(filled['2026-10-27']).toEqual(day(changes, { learning: 2 }))
    const days = { [today]: day([], { learning: 2 }), ...filled }
    const stats = progressStats({ days, goal: 20, today })
    expect(stats.days.find(shown => shown.day === '2026-10-27')?.added).toBe(1)
  })

  test('changes dated today or later, or on no day, are left to the app', () => {
    const changes = [
      learned(taberu, today),
      learned(miru, '2026-10-29'),
      { ...learned(eki, '2026-10-27'), day: 'yesterday' }
    ]
    expect(fill(changes, { known: 0, learning: 3 })).toEqual({})
  })
})
