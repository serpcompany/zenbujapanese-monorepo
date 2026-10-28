import { randomUUID } from 'node:crypto'
import { dailyListId } from '@zenbu/account-rules/daily-lists'
import { dailyListIdCases as cases } from '@zenbu/account-rules/test/cases'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { uuidOf } from '../domain/entities'
import { type Learner, useAccountService } from '../test/accounts'

const accounts = useAccountService()

const dayLength = 86_400_000
const dayOf = (moment: number) => new Date(moment).toISOString().slice(0, 10)
const daily = (day: string) => dailyListId(day) ?? ''
const dailyFromToday = (days: number) => daily(dayOf(Date.now() + days * dayLength))

const create = (id: string) => ({
  entity: 'list',
  operation: 'create',
  entityId: id,
  baseVersion: 0,
  fields: { name: 'Today', position: 0 }
})

async function codes(learner: Learner, ...ids: string[]) {
  const { results } = await accounts.mutate(learner.token, ...ids.map(create))
  return results.map(result => result.error?.code ?? result.status)
}

async function holding(email: string, ownLists: number, dailyLists: string[] = []) {
  const learner = await accounts.learner(email)
  const rows = [
    ...Array.from({ length: ownLists }, () => randomUUID()),
    ...dailyLists.map(daily)
  ].map((id, position) => `('${learner.userId}', '${id}', 'L', ${position}, 1)`)
  await accounts.running.service.rows(
    `insert into word_lists (user_id, id, name, position, version) values ${rows.join(', ')}`
  )
  return learner
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(Math.max(Date.now(), Date.UTC(2026, 10, 15, 12)))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('daily lists', () => {
  test("don't count toward the 500 lists: with 500 of the learner's own, today's and tomorrow's are created", async () => {
    const learner = await holding('daily-today@example.com', 500)
    expect(await codes(learner, dailyFromToday(0), dailyFromToday(1).toUpperCase())).toEqual([
      'applied',
      'applied'
    ])
    const { results } = await accounts.mutate(learner.token, create(randomUUID()))
    expect(results.map(result => result.error)).toEqual([
      {
        code: 'too_many_lists',
        message: 'An account holds at most 500 lists, not counting its daily lists.'
      }
    ])
  })

  test('count like any list for a day two days ahead, before 2026-10-01, or one that does not exist', async () => {
    const learner = await holding('daily-far@example.com', 500)
    expect(
      await codes(
        learner,
        dailyFromToday(2),
        daily('2026-09-30'),
        '00000000-da11-4000-8000-000020261032'
      )
    ).toEqual(['too_many_lists', 'too_many_lists', 'too_many_lists'])
  })

  test('leave room for the learner’s own: with 499 own and 30 daily lists, one more own list is created, and the next is refused', async () => {
    const days = Array.from({ length: 30 }, (_, n) => dayOf(Date.UTC(2026, 9, 1) + n * dayLength))
    const learner = await holding('daily-thirty@example.com', 499, days)
    expect(await codes(learner, randomUUID())).toEqual(['applied'])
    expect(await codes(learner, randomUUID())).toEqual(['too_many_lists'])
  })

  test('replay the shared cases: past 500 own lists, a case day from 2026-10-01 to tomorrow is created, and any other list ID is refused', async () => {
    const learner = await holding('daily-cases@example.com', 500)
    const tomorrow = dayOf(Date.now() + dayLength)
    const days = cases.days.map(({ day, id }) => ({
      id,
      uncounted: day >= '2026-10-01' && day <= tomorrow
    }))
    const others = cases.notDailyLists.filter(({ id }) => uuidOf(id))
    expect(
      await codes(learner, ...days.map(({ id }) => id), ...others.map(({ id }) => id))
    ).toEqual([
      ...days.map(({ uncounted }) => (uncounted ? 'applied' : 'too_many_lists')),
      ...others.map(() => 'too_many_lists')
    ])
  })

  test("can't be made again once deleted: the ID is refused already_exists", async () => {
    const learner = await accounts.learner('daily-deleted@example.com')
    const id = dailyFromToday(0)
    expect(await codes(learner, id)).toEqual(['applied'])
    await accounts.mutate(learner.token, { entity: 'list', operation: 'delete', entityId: id })
    expect(await codes(learner, id)).toEqual(['already_exists'])
  })
})
