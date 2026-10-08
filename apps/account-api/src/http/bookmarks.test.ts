import { randomUUID } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import { type Learner, useAccountService } from '../test/accounts'
import { SyncClient } from '../test/sync-client'

const accounts = useAccountService()

const said = {
  text: '駅はどこですか？',
  translation: "Where's the station?",
  language: 'ja',
  bookmarkedAt: '2026-10-01T12:00:00.000Z'
}

const add = (id: string, fields: Record<string, unknown> = said) => ({
  entity: 'bookmarkedSentence',
  operation: 'add',
  entityId: id,
  baseVersion: 0,
  fields
})
const remove = (id: string, baseVersion: number) => ({
  entity: 'bookmarkedSentence',
  operation: 'remove',
  entityId: id,
  baseVersion
})

const results = accounts.results
const changesOf = (learner: Learner) => accounts.changesOf(learner, 'bookmarkedSentence')

const rows = (sql: string) => accounts.running.service.rows(sql)

describe('bookmarked sentences', () => {
  test('an add puts the sentence in the account, and adding it again changes nothing', async () => {
    const learner = await accounts.learner('bookmark-add@example.com')
    const id = randomUUID().toUpperCase()
    expect(await results(learner, add(id), add(id))).toMatchObject([
      { status: 'applied', version: 1 },
      { status: 'applied', version: 1 }
    ])
    expect(await changesOf(learner)).toEqual([
      {
        entity: 'bookmarkedSentence',
        entityId: id.toLowerCase(),
        operation: 'put',
        version: 1,
        data: { id: id.toLowerCase(), ...said }
      }
    ])
  })

  test('a remove at the latest version takes it out, keeping none of what was said', async () => {
    const learner = await accounts.learner('bookmark-remove@example.com')
    const id = randomUUID()
    await results(learner, add(id))
    expect(await results(learner, remove(id, 1), remove(randomUUID(), 0))).toMatchObject([
      { status: 'applied', version: 2 },
      { status: 'applied', version: 0 }
    ])
    expect(await changesOf(learner)).toEqual([
      { entity: 'bookmarkedSentence', entityId: id, operation: 'delete', version: 2, data: null }
    ])
    expect(
      await rows(
        `select text, translation, language, bookmarked_at, present from translation_bookmarks where user_id = '${learner.userId}'`
      )
    ).toEqual([
      { text: null, translation: null, language: null, bookmarked_at: null, present: false }
    ])
  })

  test('an add the remover never saw wins, and its conflict answers the same when sent again', async () => {
    const learner = await accounts.learner('bookmark-conflict@example.com')
    const id = randomUUID()
    await results(learner, add(id), remove(id, 1), add(id))
    const stale = { id: 'stale-remove-01', ...remove(id, 1) }
    const first = await accounts.sync(learner.token, { mutations: [stale] })
    const again = await accounts.sync(learner.token, { mutations: [stale] })
    expect(first.body?.results).toMatchObject([
      { status: 'conflict', version: 3, current: { operation: 'put', data: said } }
    ])
    expect(again.body?.results).toEqual(first.body?.results)
    expect(await results(learner, remove(id, 3))).toMatchObject([{ status: 'applied', version: 4 }])
  })

  test('holds at most 2,000 to an account, and still answers one it has', async () => {
    const learner = await accounts.learner('bookmark-cap@example.com')
    const kept = randomUUID()
    await results(learner, add(kept))
    await rows(
      `insert into translation_bookmarks (user_id, id, text, language, bookmarked_at, present, version) select '${learner.userId}', gen_random_uuid()::text, 'x', 'ja', now(), true, 1 from generate_series(1, 1999) as n`
    )
    expect(await results(learner, add(randomUUID()), add(kept))).toMatchObject([
      { status: 'rejected', error: { code: 'too_many_bookmarks' } },
      { status: 'applied', version: 1 }
    ])
  })

  test('refuses a bad ID or fields, and cuts what is too long', async () => {
    const learner = await accounts.learner('bookmark-fields@example.com')
    const answer = await results(
      learner,
      add('not-a-uuid'),
      add(randomUUID(), { ...said, text: ' \t ' }),
      add(randomUUID(), { ...said, text: 7 }),
      add(randomUUID(), { ...said, translation: 7 }),
      add(randomUUID(), { ...said, language: 'fr' }),
      add(randomUUID(), { ...said, bookmarkedAt: '1999-12-31T23:59:59Z' }),
      add(randomUUID(), { text: said.text, language: 'ja' }),
      add(randomUUID(), { ...said, conversationId: randomUUID() }),
      { ...remove(randomUUID(), 0), baseVersion: undefined }
    )
    expect(answer.map(result => result.error?.code)).toEqual([
      'invalid_mutation',
      'invalid_fields',
      'invalid_fields',
      'invalid_fields',
      'invalid_fields',
      'invalid_fields',
      'invalid_fields',
      'invalid_fields',
      'invalid_mutation'
    ])
    const id = randomUUID()
    await results(
      learner,
      add(id, { ...said, text: `長\n${'い'.repeat(2500)}`, translation: 'L'.repeat(5000) })
    )
    const [stored] = await rows(
      `select length(text)::int as text, length(translation)::int as translation, position(' ' in text)::int as space from translation_bookmarks where id = '${id}'`
    )
    expect(stored).toEqual({ text: 2000, translation: 4000, space: 2 })
    const untranslated = randomUUID()
    await results(learner, add(untranslated, { ...said, translation: null }))
    expect(
      (await changesOf(learner)).find(change => change.entityId === untranslated)?.data
    ).toMatchObject({ translation: null })
  })
})

test('two devices converge on bookmarks through adds, removes, and an add the remover never saw', async () => {
  const learner = await accounts.learner('bookmark-converge@example.com')
  const phone = new SyncClient(accounts, learner.token)
  const pad = new SyncClient(accounts, learner.token)
  const [kept, dropped, contested] = [randomUUID(), randomUUID(), randomUUID()]
  for (const id of [kept, dropped, contested]) phone.change('bookmarkedSentence', 'add', id, said)
  await phone.sync()
  await pad.sync()

  pad.change('bookmarkedSentence', 'remove', dropped)
  pad.change('bookmarkedSentence', 'remove', contested)
  await pad.sync()
  phone.change('bookmarkedSentence', 'remove', contested)
  phone.change('bookmarkedSentence', 'add', contested, said)
  await phone.sync()
  await pad.sync()

  expect(pad.state()).toEqual(phone.state())
  expect(phone.dataOf('bookmarkedSentence', kept)).toMatchObject({ text: said.text })
  expect(phone.dataOf('bookmarkedSentence', dropped)).toBeNull()
  expect(pad.dataOf('bookmarkedSentence', contested)).toMatchObject({ text: said.text })
  const fresh = new SyncClient(accounts, learner.token)
  await fresh.sync()
  expect(fresh.state()).toEqual(phone.state())
})
