import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { type Learner, useAccountService } from '../test/accounts'
import { logged } from '../test/logged'

const accounts = useAccountService()

afterEach(() => vi.restoreAllMocks())

type Answer = {
  results: Record<string, unknown>[]
  changes: { entity: string; entityId: string; version: number; data: Record<string, unknown> }[]
  cursor: string
  hasMore: boolean
}

const rename = (name: string, baseVersion: number, id: string = randomUUID()) => ({
  id,
  entity: 'profile',
  operation: 'update',
  baseVersion,
  fields: { name }
})

async function synced(learner: Learner, body: Record<string, unknown> = {}): Promise<Answer> {
  const answer = await accounts.sync(learner.token, body)
  expect(answer.status, JSON.stringify(answer.body)).toBe(200)
  return answer.body as unknown as Answer
}

async function syncedToTheEnd(learner: Learner, limit: number) {
  const pages: Answer[] = []
  let cursor: string | null = null
  do {
    pages.push(await synced(learner, { cursor, limit }))
    cursor = pages.at(-1)?.cursor ?? null
  } while (pages.at(-1)?.hasMore)
  return pages
}

describe('POST /v1/sync', () => {
  test('starts a new device from no cursor with the profile, then has nothing new', async () => {
    const learner = await accounts.learner('first-sync@example.com')
    const first = await synced(learner)
    expect(first).toEqual({
      results: [],
      changes: [
        {
          entity: 'profile',
          entityId: learner.userId,
          operation: 'put',
          version: 1,
          data: expect.objectContaining({ id: learner.userId, email: 'first-sync@example.com' })
        }
      ],
      cursor: expect.any(String),
      hasMore: false
    })
    const empty = await synced(learner, { cursor: first.cursor })
    expect(empty).toEqual({ results: [], changes: [], cursor: first.cursor, hasMore: false })
  })

  test('answers only what changed after the cursor, including PATCH /v1/me', async () => {
    const learner = await accounts.learner('after-cursor@example.com')
    const { cursor } = await synced(learner)
    await accounts.changeMe(learner.token, { baseVersion: 1, name: 'Changed elsewhere' })
    const next = await synced(learner, { cursor })
    expect(next.changes).toEqual([
      expect.objectContaining({
        version: 2,
        data: expect.objectContaining({ name: 'Changed elsewhere' })
      })
    ])
    expect((await synced(learner, { cursor: next.cursor })).changes).toEqual([])
  })

  test('pages through the journal, a limit at a time, each entity once a page as it is now', async () => {
    const learner = await accounts.learner('pages@example.com')
    for (let version = 1; version <= 5; version++) {
      await accounts.changeMe(learner.token, { baseVersion: version, name: `Name ${version}` })
    }
    const entries = await accounts.running.service.rows(
      `select count(*)::int as n from sync_changes where user_id = '${learner.userId}'`
    )
    expect(entries).toEqual([{ n: 6 }])
    const pages = await syncedToTheEnd(learner, 2)
    expect(pages.map(page => page.hasMore)).toEqual([true, true, false])
    for (const page of pages) {
      expect(page.changes).toEqual([expect.objectContaining({ version: 6 })])
    }
  })

  test('applies queued mutations in order, and answers each', async () => {
    const learner = await accounts.learner('queued@example.com')
    const answer = await synced(learner, {
      mutations: [
        rename('Offline one', 1, 'mutation-0001'),
        rename('Offline two', 2, 'mutation-0002')
      ]
    })
    expect(answer.results).toEqual([
      { id: 'mutation-0001', status: 'applied', version: 2 },
      { id: 'mutation-0002', status: 'applied', version: 3 }
    ])
    expect(answer.changes).toEqual([
      expect.objectContaining({
        version: 3,
        data: expect.objectContaining({ name: 'Offline two' })
      })
    ])
    const journal = await accounts.running.service.rows(
      `select entity_type, entity_version, operation from sync_changes where user_id = '${learner.userId}' order by sequence`
    )
    expect(journal).toEqual([
      { entity_type: 'profile', entity_version: 1, operation: 'create' },
      { entity_type: 'profile', entity_version: 2, operation: 'update' },
      { entity_type: 'profile', entity_version: 3, operation: 'update' }
    ])
  })

  test('applies a mutation sent again after a lost answer once, and answers it as before', async () => {
    const learner = await accounts.learner('retry@example.com')
    const request = { mutations: [rename('Sent twice', 1, 'retry-0001')] }
    const first = await synced(learner, request)
    const retried = await synced(learner, request)
    expect(retried.results).toEqual(first.results)
    expect(first.results).toEqual([{ id: 'retry-0001', status: 'applied', version: 2 }])
    expect((await accounts.me(learner.token)).body).toMatchObject({ version: 2 })
    const recorded = await accounts.running.service.rows(
      `select count(*)::int as n from sync_mutations where user_id = '${learner.userId}'`
    )
    expect(recorded).toEqual([{ n: 1 }])
  })

  test('answers a conflict with the profile as it is now, and the same again on a retry', async () => {
    const learner = await accounts.learner('sync-conflict@example.com')
    await accounts.changeMe(learner.token, { baseVersion: 1, name: 'Changed on the Mac' })
    const request = { mutations: [rename('Changed on the phone', 1, 'conflict-0001')] }
    const conflict = await synced(learner, request)
    const expected = {
      id: 'conflict-0001',
      status: 'conflict',
      version: 2,
      current: expect.objectContaining({ name: 'Changed on the Mac', version: 2 })
    }
    expect(conflict.results).toEqual([expected])
    expect((await synced(learner, request)).results).toEqual([expected])
  })

  test('rejects an unknown entity or operation, and a reused mutation ID, and applies the rest', async () => {
    const learner = await accounts.learner('rejects@example.com')
    const answer = await synced(learner, {
      mutations: [
        { id: 'unknown-entity', entity: 'knownWord', operation: 'create', fields: {} },
        { id: 'unknown-operation', entity: 'profile', operation: 'delete', baseVersion: 1 },
        { id: 'no-base-version', entity: 'profile', operation: 'update', fields: { name: 'X' } },
        {
          id: 'bad-fields-001',
          entity: 'profile',
          operation: 'update',
          baseVersion: 1,
          fields: { email: 'x@example.com' }
        },
        rename('Still applied', 1, 'applied-0001')
      ]
    })
    expect(
      answer.results.map(result => [
        result.id,
        result.status,
        (result.error as { code?: string })?.code
      ])
    ).toEqual([
      ['unknown-entity', 'rejected', 'unknown_entity'],
      ['unknown-operation', 'rejected', 'unknown_operation'],
      ['no-base-version', 'rejected', 'invalid_mutation'],
      ['bad-fields-001', 'rejected', 'invalid_fields'],
      ['applied-0001', 'applied', undefined]
    ])
    const reused = await synced(learner, {
      mutations: [rename('Something else', 2, 'applied-0001')]
    })
    expect(reused.results).toEqual([
      {
        id: 'applied-0001',
        status: 'rejected',
        error: expect.objectContaining({ code: 'mutation_id_reused' })
      }
    ])
    expect((await accounts.me(learner.token)).body).toMatchObject({
      name: 'Still applied',
      version: 2
    })
  })

  test("never reaches another account's profile, journal, or mutation IDs", async () => {
    const one = await accounts.learner('scope-1@example.com')
    const other = await accounts.learner('scope-2@example.com')
    await synced(one, { mutations: [rename('Mine', 1, 'shared-id-01')] })
    const reaching = await synced(other, {
      mutations: [{ ...rename('Theirs', 1, 'reach-0001'), entityId: one.userId }]
    })
    expect(reaching.results).toEqual([
      {
        id: 'reach-0001',
        status: 'rejected',
        error: expect.objectContaining({ code: 'invalid_mutation' })
      }
    ])
    const sameId = await synced(other, { mutations: [rename('Also mine', 1, 'shared-id-01')] })
    expect(sameId.results).toEqual([{ id: 'shared-id-01', status: 'applied', version: 2 }])
    const changes = (await synced(other)).changes
    expect(changes.map(change => change.entityId)).toEqual([other.userId])
    expect((await accounts.me(one.token)).body).toMatchObject({ name: 'Mine', version: 2 })
  })

  test("refuses a cursor that isn't this account's, or is past the journal, before applying anything", async () => {
    const one = await accounts.learner('cursor-1@example.com')
    const other = await accounts.learner('cursor-2@example.com')
    const othersCursor = (await synced(other)).cursor
    const pastTheJournal = accounts.cursors.encode(one.userId, 10 ** 12)
    for (const cursor of [othersCursor, pastTheJournal, 'made-up-cursor', `${othersCursor}x`]) {
      const refused = await accounts.sync(one.token, {
        cursor,
        mutations: [rename('Not applied', 1)]
      })
      expect(refused, cursor).toMatchObject({
        status: 410,
        body: { error: { code: 'invalid_cursor' } }
      })
    }
    expect((await accounts.me(one.token)).body).toMatchObject({ version: 1 })
  })

  test('bounds every request: its mutations, their IDs, its limit, and its size', async () => {
    const learner = await accounts.learner('bounds@example.com')
    const tooMany = Array.from({ length: 51 }, (_, index) => rename(`Name ${index}`, 1))
    const refusals = [
      { mutations: tooMany },
      { mutations: [rename('A', 1, 'twice-0001'), rename('B', 2, 'twice-0001')] },
      { mutations: [rename('Short ID', 1, 'short')] },
      { limit: 501 },
      { limit: 0 },
      { cursor: 'x'.repeat(201) }
    ]
    for (const body of refusals) {
      const refused = await accounts.sync(learner.token, body)
      expect(refused.status, JSON.stringify(body).slice(0, 80)).toBe(400)
      expect(refused.body).toMatchObject({ error: { code: 'bad_request' } })
    }
    const huge = await accounts.sync(learner.token, {
      mutations: [{ ...rename('Huge', 1), fields: { name: 'x'.repeat(70 * 1024) } }]
    })
    expect(huge).toMatchObject({ status: 413, body: { error: { code: 'too_large' } } })
    expect((await accounts.me(learner.token)).body).toMatchObject({ version: 1 })
  })

  test("refuses a token for an account that's gone", async () => {
    const learner = await accounts.learner('sync-gone@example.com')
    await accounts.running.service.rows(`delete from users where id = '${learner.userId}'`)
    const refused = await accounts.sync(learner.token, { mutations: [rename('Gone', 1)] })
    expect(refused).toMatchObject({ status: 401, body: { error: { code: 'unauthorized' } } })
  })

  test('refuses what it could not store or hash: control characters, and fields that nest', async () => {
    const learner = await accounts.learner('unsafe@example.com')
    const unsafe = [
      { ...rename('A', 1), entity: 'pro\u0000file' },
      { ...rename('A', 1), operation: 'up date' },
      { ...rename('A', 1), entityId: `${learner.userId}\u0000` },
      { ...rename('A', 1), fields: { name: { nested: { deeper: 'x' } } } },
      { ...rename('A', 1), fields: { name: ['A'] } }
    ]
    for (const mutation of unsafe) {
      const refused = await accounts.sync(learner.token, { mutations: [mutation] })
      expect(refused.status, JSON.stringify(mutation)).toBe(400)
    }
    expect((await accounts.me(learner.token)).body).toMatchObject({ version: 1 })
  })

  test('answers a batch sent again after it failed partway: what applied stands, and the rest apply', async () => {
    const learner = await accounts.learner('partway@example.com')
    const failOnSecond = `create function fail_second() returns trigger language plpgsql as $$
      begin if new.client_mutation_id = 'partway-0002' then raise exception 'lost'; end if; return new; end $$;
      create trigger fail_second before insert on sync_mutations for each row execute function fail_second();`
    await accounts.running.service.client.exec(failOnSecond)
    const batch = {
      mutations: [rename('First', 1, 'partway-0001'), rename('Second', 2, 'partway-0002')]
    }
    vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const failed = await accounts.sync(learner.token, batch)
    expect(failed).toMatchObject({ status: 500, body: { error: { code: 'internal' } } })
    await accounts.running.service.client.exec(
      'drop trigger fail_second on sync_mutations; drop function fail_second();'
    )
    expect((await accounts.me(learner.token)).body).toMatchObject({ name: 'First', version: 2 })
    const retried = await synced(learner, batch)
    expect(retried.results).toEqual([
      { id: 'partway-0001', status: 'applied', version: 2 },
      { id: 'partway-0002', status: 'applied', version: 3 }
    ])
  })

  test("logs each request's route and status, and never the learner's profile or tokens", async () => {
    const learner = await accounts.learner('quiet-logs@example.com')
    const lines = logged()
    await accounts.changeMe(learner.token, {
      baseVersion: 1,
      name: 'Secret Name',
      username: 'secret_handle'
    })
    const answer = await synced(learner, { mutations: [rename('Other Secret', 2, 'log-check-01')] })
    await accounts.changeMe(learner.token, { baseVersion: 1, name: 'Stale Secret' })
    const log = lines()
    expect(log).toMatch(/"route":"\/v1\/sync","status":200/)
    for (const secret of [
      'Secret Name',
      'secret_handle',
      'Other Secret',
      'Stale Secret',
      'quiet-logs@example.com',
      learner.userId,
      learner.token,
      learner.session,
      answer.cursor
    ]) {
      expect(log).not.toContain(secret)
    }
  })
})
