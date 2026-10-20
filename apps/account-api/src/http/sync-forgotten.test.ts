import { createCipheriv, randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, test, vi } from 'vitest'
import { cursorKey } from '../domain/cursor'
import { type Learner, useAccountService } from '../test/accounts'
import { testSecret } from '../test/service'
import { SyncClient } from '../test/sync-client'

const accounts = useAccountService()

const noted = {
  item: '9d2e4f6a8b0c1d3e5f7a9b1c3d5e7f90',
  text: '見る。',
  headword: '見る',
  reading: 'みる'
}
const write = (id: string) => ({
  entity: 'wordNote',
  operation: 'write',
  entityId: id,
  baseVersion: 0,
  fields: noted
})
const remove = (id: string) => ({
  entity: 'wordNote',
  operation: 'delete',
  entityId: id,
  baseVersion: 1
})
const withIds = (...mutations: Record<string, unknown>[]) =>
  mutations.map(mutation => ({ id: randomUUID(), ...mutation }))
const rows = (sql: string) => accounts.running.service.rows(sql)

const headOf = async (learner: Learner) =>
  Number(
    (
      await rows(
        `select max(sequence) as head from sync_changes where user_id = '${learner.userId}'`
      )
    )[0]?.head
  )

function formatOne(learner: Learner, sequence: number) {
  const nonce = randomBytes(12)
  const sealing = createCipheriv('aes-256-gcm', cursorKey(testSecret), nonce, { authTagLength: 16 })
  sealing.setAAD(Buffer.concat([Buffer.of(1), Buffer.from(learner.userId)]))
  const position = Buffer.alloc(8)
  position.writeBigUInt64BE(BigInt(sequence))
  const sealed = Buffer.concat([sealing.update(position), sealing.final()])
  return Buffer.concat([Buffer.of(1), nonce, sealed, sealing.getAuthTag()]).toString('base64url')
}

const deletedNotes = async (learner: Learner, count: number, journaled = false) => {
  const ids = await rows(
    `insert into word_notes (user_id, id, present, version) select '${learner.userId}', gen_random_uuid()::text, false, 2 from generate_series(1, ${count}) as n returning id`
  )
  if (!journaled) return
  await rows(
    `insert into sync_changes (user_id, entity_type, entity_id, entity_version, operation) values ${ids.map(row => `('${learner.userId}', 'wordNote', '${row.id}', 2, 'delete')`).join(', ')}`
  )
}

const writeNotes = async (learner: Learner, count: number) => {
  const ids = Array.from({ length: count }, () => randomUUID())
  for (let at = 0; at < ids.length; at += 50) {
    await accounts.results(learner, ...ids.slice(at, at + 50).map(write))
  }
  return ids
}

async function notesPastAPage(learner: Learner) {
  await writeNotes(learner, 120)
  const deletedEarly = randomUUID()
  await accounts.results(learner, write(deletedEarly), remove(deletedEarly))
  await deletedNotes(learner, 1000)
  return deletedEarly
}

const forgetTheOldestDeletion = (learner: Learner) => {
  const last = randomUUID()
  return accounts.results(learner, write(last), remove(last))
}

async function pagesFromNoCursor(
  learner: Learner,
  first: Record<string, unknown> = {},
  betweenPages: (page: number) => Promise<Record<string, unknown>[]> = async () => []
) {
  const statuses: number[] = []
  let request = first
  for (let page = 1; ; page++) {
    const answer = await accounts.sync(learner.token, request)
    statuses.push(answer.status)
    const body = answer.body as { cursor: string; hasMore: boolean } | null
    if (answer.status !== 200 || !body?.hasMore) return statuses
    request = { cursor: body.cursor, mutations: withIds(...(await betweenPages(page))) }
  }
}

async function devicesWithNotes(learner: Learner, ids: string[]) {
  const phone = new SyncClient(accounts, learner.token)
  const pad = new SyncClient(accounts, learner.token)
  for (const id of ids) phone.change('wordNote', 'write', id, noted)
  await phone.sync()
  await pad.sync()
  return { phone, pad }
}

async function statusesOf(work: () => Promise<void>) {
  const statuses: number[] = []
  const sent = accounts.sync
  const counted = vi.spyOn(accounts, 'sync').mockImplementation(async (token, body) => {
    const answer = await sent(token, body)
    statuses.push(answer.status)
    return answer
  })
  try {
    await work()
  } finally {
    counted.mockRestore()
  }
  return statuses
}

describe('a sync past what the account forgot', () => {
  test('a full read of an account with more than a page before a forgotten deletion reaches its end with no 410', async () => {
    const learner = await accounts.learner('full-read-past-forgotten@example.com')
    const deletedEarly = await notesPastAPage(learner)
    await forgetTheOldestDeletion(learner)
    expect(await pagesFromNoCursor(learner)).toEqual([200, 200])
    const fresh = new SyncClient(accounts, learner.token)
    await fresh.sync()
    expect(fresh.local.has(`wordNote:${deletedEarly}`)).toBe(false)
    expect(fresh.state().size).toBe(120)
  })

  test("a full read whose own change forgets a deletion past its first page isn't refused for it", async () => {
    const learner = await accounts.learner('full-read-forgets-itself@example.com')
    await notesPastAPage(learner)
    const last = randomUUID()
    expect(
      await pagesFromNoCursor(learner, { mutations: withIds(write(last), remove(last)) })
    ).toEqual([200, 200])
  })

  test("a full read whose later page's change forgets deletions older than the read isn't refused for them", async () => {
    const learner = await accounts.learner('full-read-later-page-forgets@example.com')
    const [mine] = await writeNotes(learner, 300)
    await deletedNotes(learner, 1000, true)
    const statuses = await pagesFromNoCursor(learner, {}, async page =>
      page === 1 && mine ? [remove(mine)] : []
    )
    expect(statuses.every(status => status === 200)).toBe(true)
    expect(statuses.length).toBeGreaterThan(2)
  })

  test('a full read is refused once a note it brought is deleted, then forgotten before the read reaches the deletion', async () => {
    const learner = await accounts.learner('full-read-forgets-what-it-brought@example.com')
    const [brought, ...rest] = await writeNotes(learner, 250)
    const statuses = await pagesFromNoCursor(learner, {}, async page => {
      if (page !== 1 || !brought) return []
      await accounts.results(learner, remove(brought))
      await deletedNotes(learner, 999)
      return [remove(rest.at(-1) ?? '')]
    })
    expect(statuses).toEqual([200, 200, 410])
  })

  test('a device whose own deletion makes the account forget one past its cursor is refused once, then drops it', async () => {
    const learner = await accounts.learner('own-deletion-forgets-past-it@example.com')
    const [missed, mine] = [randomUUID(), randomUUID()]
    const { phone, pad } = await devicesWithNotes(learner, [missed, mine])
    phone.change('wordNote', 'delete', missed)
    await phone.sync()
    await deletedNotes(learner, 999)
    pad.change('wordNote', 'delete', mine)
    const statuses = await statusesOf(async () => {
      await pad.sync()
      await pad.sync()
      await pad.sync()
    })
    expect(statuses.filter(status => status === 410)).toEqual([410])
    expect(pad.dataOf('wordNote', missed)).toBeNull()
    await phone.sync()
    expect(pad.state()).toEqual(phone.state())
  })

  test('a device away while the account forgets a deletion past it is refused once, then reads everything and catches up', async () => {
    const learner = await accounts.learner('away-past-forgotten@example.com')
    const [kept, deleted] = [randomUUID(), randomUUID()]
    const { phone, pad } = await devicesWithNotes(learner, [kept, deleted])
    phone.change('wordNote', 'delete', deleted)
    await phone.sync()
    await deletedNotes(learner, 1000)
    await forgetTheOldestDeletion(learner)
    const statuses = await statusesOf(() => pad.sync())
    expect(statuses.filter(status => status === 410)).toEqual([410])
    expect(pad.dataOf('wordNote', deleted)).toBeNull()
    expect(pad.state()).toEqual(phone.state())
  })

  test('takes a cursor given before cursors carried a floor, and refuses it once the account forgets a deletion past it', async () => {
    const learner = await accounts.learner('cursor-before-floors@example.com')
    const deleted = randomUUID()
    await accounts.results(learner, write(deleted))
    const before = await headOf(learner)
    expect(
      (await accounts.sync(learner.token, { cursor: formatOne(learner, before) })).status
    ).toBe(200)
    await accounts.results(learner, remove(deleted))
    await deletedNotes(learner, 1000)
    await forgetTheOldestDeletion(learner)
    expect(
      await accounts.sync(learner.token, { cursor: formatOne(learner, before) })
    ).toMatchObject({ status: 410, body: { error: { code: 'invalid_cursor' } } })
    const now = await accounts.sync(learner.token, {
      cursor: formatOne(learner, await headOf(learner))
    })
    expect(now.status).toBe(200)
    expect((await accounts.sync(learner.token, { cursor: now.body?.cursor })).status).toBe(200)
  })

  test("a full read whose own first changes delete a note and make the account forget it isn't refused for it", async () => {
    const learner = await accounts.learner('full-read-forgets-its-own-deletion@example.com')
    const [deletedHere] = await writeNotes(learner, 120)
    await rows(
      `insert into word_notes (user_id, id, present, version, updated_at) select '${learner.userId}', gen_random_uuid()::text, false, 2, now() + interval '1 hour' from generate_series(1, 999) as n`
    )
    const last = randomUUID()
    const first = withIds(remove(deletedHere ?? ''), write(last), remove(last))
    expect(await pagesFromNoCursor(learner, { mutations: first })).toEqual([200, 200])
  })
})
