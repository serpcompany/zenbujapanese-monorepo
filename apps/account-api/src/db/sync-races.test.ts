import { randomUUID } from 'node:crypto'
import type pg from 'pg'
import { describe, expect, test } from 'vitest'
import { createAccounts } from '../domain/accounts'
import { scopes } from '../domain/clients'
import { cursorKey, cursors, searchKeys } from '../domain/cursor'
import type { AccountStore } from '../domain/store'
import { gate } from '../test/gate'
import { realPostgres, usePostgres } from '../test/postgres'
import { accountStore } from './accounts'

const everyScope = new Set(scopes)
const postgres = usePostgres()

const note = (entityId: string, operation: string, baseVersion: number) => ({
  id: randomUUID(),
  entity: 'wordNote',
  operation,
  entityId,
  baseVersion,
  ...(operation === 'write' ? { fields: { item: 'kanji:見', text: '見る。' } } : {})
})

const syncsOn = (on: AccountStore) => {
  const accounts = createAccounts(on, cursors(cursorKey('test')), searchKeys('test'))
  return {
    answer: (userId: string, body: Record<string, unknown>) =>
      accounts.sync(userId, body, everyScope),
    async synced(userId: string, body: Record<string, unknown>) {
      const answer = await accounts.sync(userId, body, everyScope)
      if (answer.status !== 'synced') throw new Error(`the sync answered ${answer.status}`)
      return answer
    }
  }
}

async function forgetTheOldest(raw: pg.Client, plain: ReturnType<typeof syncsOn>, id: string) {
  await raw.query(
    'insert into word_notes (user_id, id, present, version) select $1, gen_random_uuid()::text, false, 2 from generate_series(1, 999) as n',
    [id]
  )
  const last = randomUUID()
  await plain.synced(id, { mutations: [note(last, 'write', 0), note(last, 'delete', 1)] })
}

async function twoNotes(prefix: string) {
  const account = await postgres.anAccount(prefix)
  const store = accountStore(account.database.db)
  const plain = syncsOn(store)
  const [missed, kept] = [randomUUID(), randomUUID()]
  await plain.synced(account.id, {
    mutations: [note(missed, 'write', 0), note(kept, 'write', 0)]
  })
  return { ...account, store, plain, missed, kept }
}

describe('syncs that race the account forgetting a deletion', () => {
  test('refuses the next sync after another device makes the account forget a deletion between a sync check and its page', async () => {
    const { raw, id, store, plain, missed, kept, done } = await twoNotes('forgotten-mid-sync')
    const padAt = (await plain.synced(id, {})).cursor
    await plain.synced(id, { mutations: [note(missed, 'delete', 1)] })
    await raw.query(
      'insert into word_notes (user_id, id, present, version) select $1, gen_random_uuid()::text, false, 2 from generate_series(1, 999) as n',
      [id]
    )
    let raced = false
    const racing = syncsOn({
      ...store,
      async changesAfter(userId, sequence, limit) {
        if (!raced) {
          raced = true
          await plain.synced(id, { mutations: [note(kept, 'delete', 1)] })
        }
        return store.changesAfter(userId, sequence, limit)
      }
    })
    const during = await racing.synced(id, { cursor: padAt })
    expect(during.changes.map(change => change.entityId)).not.toContain(missed)
    expect(await plain.answer(id, { cursor: during.cursor })).toEqual({ status: 'invalid_cursor' })
    await done()
  })

  test.skipIf(realPostgres === '')(
    "refuses a full read's next sync after a deletion still being saved as it read is forgotten, whatever another account saved meanwhile",
    async () => {
      const { raw, id, user, store, plain, missed, done } = await twoNotes('forgotten-in-flight')
      const other = await user('other-account')
      const saving = gate()
      const finish = gate()
      const holding = syncsOn({
        ...store,
        withLockedAccount: (userId, work) =>
          store.withLockedAccount(userId, async account => {
            const result = await work(account)
            saving.open()
            await finish.opened
            return result
          })
      })
      const deleting = holding.synced(id, { mutations: [note(missed, 'delete', 1)] })
      await saving.opened
      await plain.synced(other, { mutations: [note(randomUUID(), 'write', 0)] })
      const read = await plain.synced(id, {})
      expect(read.changes.find(change => change.entityId === missed)?.operation).toBe('put')
      finish.open()
      await deleting
      await forgetTheOldest(raw, plain, id)
      expect(await plain.answer(id, { cursor: read.cursor })).toEqual({ status: 'invalid_cursor' })
      await done()
    }
  )

  test("refuses a full read's next page when a deletion saved just after the read took its entities is forgotten", async () => {
    const { raw, id, store, plain, missed, done } = await twoNotes('forgotten-after-entities')
    let raced = false
    const racing = syncsOn({
      ...store,
      reader(userId) {
        const real = store.reader(userId)
        return {
          ...real,
          async wordNote(noteId: string) {
            const found = await real.wordNote(noteId)
            if (!raced && noteId === missed) {
              raced = true
              await plain.synced(id, { mutations: [note(missed, 'delete', 1)] })
            }
            return found
          }
        }
      }
    })
    const read = await racing.synced(id, {})
    expect(read.changes.find(change => change.entityId === missed)?.operation).toBe('put')
    await forgetTheOldest(raw, plain, id)
    expect(await plain.answer(id, { cursor: read.cursor })).toEqual({ status: 'invalid_cursor' })
    await done()
  })

  test("doesn't refuse a device two syncs past a deletion when the account forgets it", async () => {
    const { raw, id, plain, missed, done } = await twoNotes('forgotten-behind')
    const read = await plain.synced(id, {})
    await plain.synced(id, { mutations: [note(missed, 'delete', 1)] })
    const first = await plain.synced(id, { cursor: read.cursor })
    expect(first.changes.find(change => change.entityId === missed)?.operation).toBe('delete')
    const second = await plain.synced(id, { cursor: first.cursor })
    await forgetTheOldest(raw, plain, id)
    expect(await plain.answer(id, { cursor: second.cursor })).toMatchObject({ status: 'synced' })
    await done()
  })
})
