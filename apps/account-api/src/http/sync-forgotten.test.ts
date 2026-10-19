import { randomUUID } from 'node:crypto'
import { describe, expect, test, vi } from 'vitest'
import { type Learner, useAccountService } from '../test/accounts'
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
const rows = (sql: string) => accounts.running.service.rows(sql)

async function notesPastAPage(learner: Learner) {
  for (let batch = 0; batch < 3; batch++) {
    await accounts.results(learner, ...Array.from({ length: 40 }, () => write(randomUUID())))
  }
  const deletedEarly = randomUUID()
  await accounts.results(learner, write(deletedEarly), remove(deletedEarly))
  await rows(
    `insert into word_notes (user_id, id, present, version) select '${learner.userId}', gen_random_uuid()::text, false, 2 from generate_series(1, 1000) as n`
  )
  return deletedEarly
}

const forgetTheOldestDeletion = (learner: Learner) => {
  const last = randomUUID()
  return accounts.results(learner, write(last), remove(last))
}

async function pagesFromNoCursor(learner: Learner, first: Record<string, unknown> = {}) {
  const statuses: number[] = []
  let request = first
  for (;;) {
    const answer = await accounts.sync(learner.token, request)
    statuses.push(answer.status)
    const body = answer.body as { cursor: string; hasMore: boolean } | null
    if (answer.status !== 200 || !body?.hasMore) return statuses
    request = { cursor: body.cursor }
  }
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
      await pagesFromNoCursor(learner, {
        mutations: [write(last), remove(last)].map(mutation => ({ id: randomUUID(), ...mutation }))
      })
    ).toEqual([200, 200])
  })

  test('a device away while the account forgets a deletion past it is refused once, then reads everything and catches up', async () => {
    const learner = await accounts.learner('away-past-forgotten@example.com')
    const phone = new SyncClient(accounts, learner.token)
    const pad = new SyncClient(accounts, learner.token)
    const [kept, deleted] = [randomUUID(), randomUUID()]
    for (const id of [kept, deleted]) phone.change('wordNote', 'write', id, noted)
    await phone.sync()
    await pad.sync()
    const headBefore = Number(
      (
        await rows(
          `select max(sequence) as head from sync_changes where user_id = '${learner.userId}'`
        )
      )[0]?.head
    )
    phone.change('wordNote', 'delete', deleted)
    await phone.sync()
    await rows(
      `insert into word_notes (user_id, id, present, version) select '${learner.userId}', gen_random_uuid()::text, false, 2 from generate_series(1, 1000) as n`
    )
    await forgetTheOldestDeletion(learner)
    const unmarked = (sequence: number) =>
      accounts.cursors.encode(learner.userId, { sequence, forgotten: 0 })
    expect((await accounts.sync(learner.token, { cursor: unmarked(headBefore) })).status).toBe(410)
    const statuses: number[] = []
    const sent = accounts.sync
    const counted = vi.spyOn(accounts, 'sync').mockImplementation(async (token, body) => {
      const answer = await sent(token, body)
      statuses.push(answer.status)
      return answer
    })
    await pad.sync()
    counted.mockRestore()
    expect(statuses.filter(status => status === 410)).toEqual([410])
    expect(pad.dataOf('wordNote', deleted)).toBeNull()
    expect(pad.state()).toEqual(phone.state())
  })
})
