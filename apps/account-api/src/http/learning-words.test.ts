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
const set = (itemId: string, baseVersion: number, state: string) =>
  knownWord('set', itemId, baseVersion, { state, ...taberu })

const wordOf = async (learner: Learner, itemId: string) =>
  (await accounts.changesOf(learner, 'knownWord')).find(change => change.entityId === itemId)

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
        known: state === 'known'
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
      known: false
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
