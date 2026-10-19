import { randomUUID } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import { appliedAt, deleted, type Learner, outcomesOf, useAccountService } from '../test/accounts'
import { SyncClient } from '../test/sync-client'

const accounts = useAccountService()

const miru = '9d2e4f6a8b0c1d3e5f7a9b1c3d5e7f90'
const noted = { item: miru, text: '目で見る。', headword: '見る', reading: 'みる' }

const write = (id: string, baseVersion: number, fields: Record<string, unknown> = noted) => ({
  entity: 'wordNote',
  operation: 'write',
  entityId: id,
  baseVersion,
  fields
})
const remove = (id: string, baseVersion: number) => ({
  entity: 'wordNote',
  operation: 'delete',
  entityId: id,
  baseVersion
})

const results = accounts.results
const changesOf = (learner: Learner) => accounts.changesOf(learner, 'wordNote')
const rows = (sql: string) => accounts.running.service.rows(sql)

describe('word notes', () => {
  test('a write puts the note in the account, and writing it again as it is changes nothing', async () => {
    const learner = await accounts.learner('note-write@example.com')
    const id = randomUUID().toUpperCase()
    expect(await results(learner, write(id, 0), write(id, 1), write(id, 0))).toMatchObject(
      appliedAt(1, 1, 1)
    )
    expect(await changesOf(learner)).toEqual([
      {
        entity: 'wordNote',
        entityId: id.toLowerCase(),
        operation: 'put',
        version: 1,
        data: {
          id: id.toLowerCase(),
          itemId: miru,
          text: noted.text,
          headword: '見る',
          reading: 'みる'
        }
      }
    ])
  })

  test('a write at an older version conflicts with the note as it is, and a delete the writer never saw loses to the write', async () => {
    const learner = await accounts.learner('note-conflict@example.com')
    const id = randomUUID()
    await results(learner, write(id, 0), write(id, 1, { ...noted, text: 'On the phone.' }))
    const stale = { id: 'stale-note-write', ...write(id, 1, { ...noted, text: 'On the iPad.' }) }
    const first = await accounts.sync(learner.token, { mutations: [stale] })
    const again = await accounts.sync(learner.token, { mutations: [stale] })
    expect(first.body?.results).toMatchObject([
      { status: 'conflict', version: 2, current: { data: { text: 'On the phone.' } } }
    ])
    expect(again.body?.results).toEqual(first.body?.results)
    expect(await results(learner, remove(id, 1))).toMatchObject([
      { status: 'conflict', version: 2, current: { operation: 'put' } }
    ])
    expect(await results(learner, remove(id, 2))).toMatchObject([{ status: 'applied', version: 3 }])
    expect(
      await results(learner, write(id, 2, { ...noted, text: 'Written before the delete.' }))
    ).toMatchObject([{ status: 'applied', version: 4 }])
    expect((await changesOf(learner))[0]?.data).toMatchObject({
      text: 'Written before the delete.'
    })
  })

  test('a delete keeps none of what was written, and deleting a note the account has not is applied', async () => {
    const learner = await accounts.learner('note-delete@example.com')
    const id = randomUUID()
    await results(learner, write(id, 0))
    expect(await results(learner, remove(id, 1), remove(randomUUID(), 0))).toMatchObject(
      appliedAt(2, 0)
    )
    expect(await changesOf(learner)).toEqual([deleted('wordNote', id, 2)])
    expect(
      await rows(
        `select item_id, text, headword, reading, present from word_notes where user_id = '${learner.userId}'`
      )
    ).toEqual([{ item_id: null, text: null, headword: null, reading: null, present: false }])
  })

  test('keeps line breaks, makes other control characters spaces, and never cuts a note', async () => {
    const learner = await accounts.learner('note-text@example.com')
    const [kept, long, edge] = [randomUUID(), randomUUID(), randomUUID()]
    const answer = await results(
      learner,
      write(kept, 0, { item: 'kanji:見', text: ' 一行目\r\n二行目\t三\u0007 ' }),
      write(long, 0, { item: miru, text: 'あ'.repeat(10_001) }),
      write(edge, 0, { item: `wn1:${'a'.repeat(64)}:2`, text: 'あ'.repeat(10_000) })
    )
    expect(outcomesOf(answer)).toEqual(['applied', 'invalid_fields', 'applied'])
    const changes = await changesOf(learner)
    expect(changes.find(change => change.entityId === kept)?.data).toEqual({
      id: kept,
      itemId: 'kanji:見',
      text: '一行目\n二行目\t三',
      headword: null,
      reading: null
    })
  })

  test('refuses a bad ID, item, or field, and an operation without baseVersion', async () => {
    const learner = await accounts.learner('note-fields@example.com')
    const answer = await results(
      learner,
      write('not-a-uuid', 0),
      write(randomUUID(), 0, { ...noted, item: 'kanji:ab' }),
      write(randomUUID(), 0, { ...noted, item: 'wn1:short' }),
      write(randomUUID(), 0, { ...noted, text: ' \n ' }),
      write(randomUUID(), 0, { ...noted, text: 7 }),
      write(randomUUID(), 0, { ...noted, headword: 'a\u200bb' }),
      write(randomUUID(), 0, { ...noted, color: 'red' }),
      { ...write(randomUUID(), 0), baseVersion: undefined },
      { ...remove(randomUUID(), 0), baseVersion: undefined }
    )
    expect(outcomesOf(answer)).toEqual([
      'invalid_mutation',
      ...Array(6).fill('invalid_fields'),
      'invalid_mutation',
      'invalid_mutation'
    ])
  })

  test('remembers the latest 1,000 deleted notes, and forgets older ones with their journal rows', async () => {
    const learner = await accounts.learner('note-forgets@example.com')
    await rows(
      `insert into word_notes (user_id, id, present, version, updated_at) select '${learner.userId}', gen_random_uuid()::text, false, 2, now() - make_interval(mins => n) from generate_series(1, 1000) as n`
    )
    const id = randomUUID()
    await results(learner, write(id, 0))
    await results(learner, remove(id, 1))
    expect(
      await rows(
        `select count(*)::int as n, count(*) filter (where id = '${id}')::int as latest from word_notes where user_id = '${learner.userId}'`
      )
    ).toEqual([{ n: 1000, latest: 1 }])
  })

  test('holds at most 10,000 notes to an account, and still takes a change to one it has', async () => {
    const learner = await accounts.learner('note-cap@example.com')
    const kept = randomUUID()
    await results(learner, write(kept, 0))
    await rows(
      `insert into word_notes (user_id, id, item_id, text, present, version) select '${learner.userId}', gen_random_uuid()::text, '${miru}', 'x', true, 1 from generate_series(1, 9999) as n`
    )
    expect(
      await results(learner, write(randomUUID(), 0), write(kept, 1, { ...noted, text: 'More.' }))
    ).toMatchObject([
      { status: 'rejected', error: { code: 'too_many_notes' } },
      { status: 'applied', version: 2 }
    ])
  })
})

test('two devices converge on notes through writes, deletes, and a write the deleter never saw', async () => {
  const learner = await accounts.learner('note-converge@example.com')
  const phone = new SyncClient(accounts, learner.token)
  const pad = new SyncClient(accounts, learner.token)
  const [kept, dropped, contested] = [randomUUID(), randomUUID(), randomUUID()]
  for (const id of [kept, dropped, contested]) phone.change('wordNote', 'write', id, noted)
  await phone.sync()
  await pad.sync()

  pad.change('wordNote', 'delete', dropped)
  pad.change('wordNote', 'delete', contested)
  phone.change('wordNote', 'write', contested, { ...noted, text: 'Still needed.' })
  await phone.sync()
  await pad.sync()
  await phone.sync()

  expect(pad.state()).toEqual(phone.state())
  expect(phone.dataOf('wordNote', kept)).toMatchObject({ text: noted.text })
  expect(phone.dataOf('wordNote', dropped)).toBeNull()
  expect(pad.dataOf('wordNote', contested)).toMatchObject({ text: 'Still needed.' })
  const fresh = new SyncClient(accounts, learner.token)
  await fresh.sync()
  expect(fresh.state()).toEqual(phone.state())
})
