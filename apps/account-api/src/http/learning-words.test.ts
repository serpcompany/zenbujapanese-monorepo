import { describe, expect, test } from 'vitest'
import { appliedAt, type Learner, outcomesOf, useAccountService } from '../test/accounts'
import { SyncClient } from '../test/sync-client'

const accounts = useAccountService()

const item = (n: number) => n.toString(16).padStart(32, 'a')
const taberu = { headword: '食べる', reading: 'たべる' }

const knownWord = (
  operation: string,
  itemId: string,
  baseVersion: number,
  fields?: Record<string, unknown>
) => ({ entity: 'knownWord', operation, entityId: itemId, baseVersion, ...(fields && { fields }) })
const set = (itemId: string, baseVersion: number, state: string, stateChangedAt?: string) =>
  knownWord('set', itemId, baseVersion, {
    state,
    ...taberu,
    ...(stateChangedAt && { stateChangedAt })
  })

const wordOf = async (learner: Learner, itemId: string) =>
  (await accounts.changesOf(learner, 'knownWord')).find(change => change.entityId === itemId)

const timeOf = async (learner: Learner, itemId: string) =>
  (await wordOf(learner, itemId))?.data?.stateChangedAt
const tuesday = '2026-10-27T09:30:00.000Z'
const monday = '2026-10-26T08:00:00.000Z'

describe('Learning words', () => {
  test('a set makes a word Learning, which reads as not known; setting it again changes nothing', async () => {
    const learner = await accounts.learner('learning-set@example.com')
    expect(
      await accounts.results(learner, set(item(1), 0, 'learning'), set(item(1), 0, 'learning'))
    ).toMatchObject(appliedAt(1, 1))
    expect(await wordOf(learner, item(1))).toMatchObject({
      version: 1,
      data: { itemId: item(1), ...taberu, state: 'learning', known: false }
    })
  })

  test('a word moves between all three states, each change at its current version', async () => {
    const learner = await accounts.learner('learning-moves@example.com')
    const moves = ['learning', 'known', 'unknown', 'known', 'learning', 'unknown', 'learning']
    for (const [version, state] of moves.entries()) {
      expect(await accounts.results(learner, set(item(2), version, state))).toMatchObject(
        appliedAt(version + 1)
      )
      expect((await wordOf(learner, item(2)))?.data).toEqual({
        itemId: item(2),
        ...taberu,
        state,
        known: state === 'known',
        stateChangedAt: expect.any(String)
      })
    }
  })

  test('a set made before a later change conflicts with the word as it is now', async () => {
    const learner = await accounts.learner('learning-stale@example.com')
    await accounts.results(learner, set(item(3), 0, 'learning'), set(item(3), 1, 'known'))
    expect(await accounts.results(learner, set(item(3), 1, 'unknown'))).toMatchObject([
      {
        status: 'conflict',
        version: 2,
        current: { entity: 'knownWord', version: 2, data: { state: 'known', known: true } }
      }
    ])
    expect(await accounts.results(learner, set(item(3), 1, 'known'))).toMatchObject(appliedAt(2))
  })

  test("an older app's mark makes a Learning word Known, and its clear leaves it Learning", async () => {
    const learner = await accounts.learner('learning-older@example.com')
    await accounts.results(learner, set(item(4), 0, 'learning'))
    expect(
      await accounts.results(
        learner,
        knownWord('clear', item(4), 1),
        knownWord('clear', item(4), 0)
      )
    ).toMatchObject(appliedAt(1, 1))
    expect((await wordOf(learner, item(4)))?.data).toMatchObject({
      state: 'learning',
      known: false
    })
    expect(await accounts.results(learner, knownWord('mark', item(4), 0, taberu))).toMatchObject([
      { status: 'conflict', current: { version: 1, data: { state: 'learning', known: false } } }
    ])
    expect(
      await accounts.results(
        learner,
        knownWord('mark', item(4), 1, taberu),
        knownWord('clear', item(4), 2)
      )
    ).toMatchObject(appliedAt(2, 3))
    expect((await wordOf(learner, item(4)))?.data).toMatchObject({ state: 'unknown', known: false })
  })

  test('refuses a set with no state or one it does not know, and a Learning or Known one with no headword', async () => {
    const learner = await accounts.learner('learning-bad@example.com')
    const results = await accounts.results(
      learner,
      knownWord('set', item(5), 0),
      knownWord('set', item(5), 0, { state: 'mastered', ...taberu }),
      knownWord('set', item(5), 0, { state: 'learning' }),
      knownWord('set', item(5), 0, { state: 'known', reading: 'たべる' }),
      { ...set(item(5), 0, 'learning'), baseVersion: undefined },
      knownWord('set', 'kanji:ab', 0, { state: 'learning', ...taberu }),
      knownWord('set', item(5), 0, { state: 'unknown' })
    )
    expect(outcomesOf(results)).toEqual([
      'invalid_fields',
      'invalid_fields',
      'invalid_fields',
      'invalid_fields',
      'invalid_mutation',
      'invalid_mutation',
      'applied'
    ])
  })

  test('moving a word to Unknown keeps its text, and reads no field but the state', async () => {
    const learner = await accounts.learner('learning-unknown@example.com')
    await accounts.results(learner, set(item(6), 0, 'learning'))
    expect(
      await accounts.results(learner, knownWord('set', item(6), 1, { state: 'unknown' }))
    ).toMatchObject(appliedAt(2))
    expect((await wordOf(learner, item(6)))?.data).toEqual({
      itemId: item(6),
      ...taberu,
      state: 'unknown',
      known: false,
      stateChangedAt: expect.any(String)
    })
  })
})

test('an app that shows Learning and an older app end with the same words', async () => {
  const learner = await accounts.learner('learning-converge@example.com')
  const phone = new SyncClient(accounts, learner.token)
  const older = new SyncClient(accounts, learner.token)
  phone.change('knownWord', 'set', item(7), { state: 'learning', ...taberu })
  phone.change('knownWord', 'set', item(8), { state: 'known', ...taberu })
  await phone.sync()
  await older.sync()
  expect(older.dataOf('knownWord', item(7))).toMatchObject({ known: false })

  older.change('knownWord', 'mark', item(7), taberu)
  older.change('knownWord', 'clear', item(8))
  phone.change('knownWord', 'set', item(7), { state: 'unknown' })
  phone.change('knownWord', 'set', item(8), { state: 'learning', ...taberu })
  await older.sync()
  await phone.sync()
  await older.sync()

  expect(phone.state()).toEqual(older.state())
  expect(phone.dataOf('knownWord', item(7))).toMatchObject({ state: 'known', known: true })
  expect(phone.dataOf('knownWord', item(8))).toMatchObject({ state: 'unknown', known: false })
})

async function sentAt(learner: Learner, ...mutations: Record<string, unknown>[]) {
  const before = Date.now()
  const answer = await accounts.mutate(learner.token, ...mutations)
  return { answer, before, after: Date.now() }
}

const within = (time: unknown, before: number, after: number) => {
  const moment = new Date(String(time)).getTime()
  expect(moment).toBeGreaterThanOrEqual(before)
  expect(moment).toBeLessThanOrEqual(after)
}

describe("when each word's state began", () => {
  test('a set with a time answers that time in its put, in a later read, and in a read of the kind', async () => {
    const learner = await accounts.learner('state-time-sent@example.com')
    const { changes, results } = await accounts.mutate(
      learner.token,
      set(item(1), 0, 'learning', '2026-10-27T18:30:00+09:00')
    )
    expect(results).toMatchObject(appliedAt(1))
    expect(changes.find(change => change.entityId === item(1))?.data).toMatchObject({
      state: 'learning',
      stateChangedAt: tuesday
    })
    expect(await timeOf(learner, item(1))).toBe(tuesday)
    const kind = await accounts.everyOfKind(learner.token, 'knownWord')
    expect(kind.find(change => change.entityId === item(1))?.data).toMatchObject({
      stateChangedAt: tuesday
    })
  })

  test("a set without a time answers the service's, and so does one ahead of the service's", async () => {
    const learner = await accounts.learner('state-time-service@example.com')
    const left = await sentAt(learner, set(item(2), 0, 'learning'))
    expect(left.answer.results).toMatchObject(appliedAt(1))
    within(await timeOf(learner, item(2)), left.before, left.after)
    const ahead = await sentAt(learner, set(item(3), 0, 'known', '2100-01-01T00:00:00Z'))
    expect(ahead.answer.results).toMatchObject(appliedAt(1))
    within(await timeOf(learner, item(3)), ahead.before, ahead.after)
  })

  test('refuses a time before 2000 or not in ISO 8601, on each of the three changes', async () => {
    const learner = await accounts.learner('state-time-bad@example.com')
    const results = await accounts.results(
      learner,
      set(item(4), 0, 'learning', '1999-12-31T23:59:59Z'),
      set(item(4), 0, 'learning', '2026-10-27'),
      set(item(4), 0, 'learning', 'Tuesday'),
      knownWord('set', item(4), 0, { state: 'learning', ...taberu, stateChangedAt: 1793100000 }),
      knownWord('mark', item(4), 0, { ...taberu, stateChangedAt: null }),
      knownWord('clear', item(4), 0, { stateChangedAt: '27/10/2026 09:30' })
    )
    expect(outcomesOf(results)).toEqual(Array(6).fill('invalid_fields'))
    expect(await timeOf(learner, item(4))).toBeUndefined()
  })

  test('setting the state the word has keeps the earlier time, and a conflict changes nothing', async () => {
    const learner = await accounts.learner('state-time-kept@example.com')
    await accounts.results(learner, set(item(5), 0, 'learning', monday))
    expect(
      await accounts.results(
        learner,
        set(item(5), 1, 'learning', tuesday),
        set(item(5), 0, 'known', tuesday)
      )
    ).toMatchObject([
      { status: 'applied', version: 1 },
      { status: 'conflict', version: 1 }
    ])
    expect(await timeOf(learner, item(5))).toBe(monday)
    await accounts.results(learner, set(item(5), 1, 'known', tuesday))
    expect(await timeOf(learner, item(5))).toBe(tuesday)
  })

  test('mark and clear take it too, and a clear of a word not Known keeps the earlier time', async () => {
    const learner = await accounts.learner('state-time-mark@example.com')
    await accounts.results(
      learner,
      knownWord('mark', item(6), 0, { ...taberu, stateChangedAt: monday })
    )
    expect(await timeOf(learner, item(6))).toBe(monday)
    await accounts.results(learner, knownWord('clear', item(6), 1, { stateChangedAt: tuesday }))
    expect(await timeOf(learner, item(6))).toBe(tuesday)
    await accounts.results(learner, set(item(7), 0, 'learning', monday))
    expect(
      await accounts.results(learner, knownWord('clear', item(7), 1, { stateChangedAt: tuesday }))
    ).toMatchObject(appliedAt(1))
    expect(await timeOf(learner, item(7))).toBe(monday)
  })

  test('a word last changed before the service kept the time answers null until its state changes', async () => {
    const learner = await accounts.learner('state-time-older@example.com')
    await accounts.results(learner, set(item(8), 0, 'known'))
    await accounts.running.service.client.exec(
      `update known_words set state_changed_at = null where item_id = '${item(8)}'`
    )
    expect(await timeOf(learner, item(8))).toBeNull()
    await accounts.results(learner, set(item(8), 1, 'known', tuesday))
    expect(await timeOf(learner, item(8))).toBeNull()
    await accounts.results(learner, set(item(8), 1, 'learning', tuesday))
    expect(await timeOf(learner, item(8))).toBe(tuesday)
  })
})
