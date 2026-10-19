import { describe, expect, test } from 'vitest'
import { searchIdOf } from '../domain/recent-searches'
import { type Learner, useAccountService } from '../test/accounts'
import { SyncClient } from '../test/sync-client'

const accounts = useAccountService()

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 1, 12) + minutes * 60_000).toISOString()

const search = (query: string, baseVersion: number, searchedAt: string) => ({
  entity: 'recentSearch',
  operation: 'search',
  entityId: searchIdOf(query),
  baseVersion,
  fields: { query, searchedAt }
})
const remove = (query: string) => ({
  entity: 'recentSearch',
  operation: 'remove',
  entityId: searchIdOf(query)
})

const results = accounts.results
const changesOf = (learner: Learner) => accounts.changesOf(learner, 'recentSearch')
const rows = (sql: string) => accounts.running.service.rows(sql)

describe('recent searches', () => {
  test('a search puts the query in the account, keyed by its SHA-256, and the later time is kept', async () => {
    const learner = await accounts.learner('search-put@example.com')
    expect(
      await results(
        learner,
        search('食べる', 0, at(5)),
        search('食べる', 1, at(1)),
        search('食べる', 0, at(9))
      )
    ).toMatchObject([
      { status: 'applied', version: 1 },
      { status: 'applied', version: 1 },
      { status: 'applied', version: 2 }
    ])
    expect(await changesOf(learner)).toEqual([
      {
        entity: 'recentSearch',
        entityId: searchIdOf('食べる'),
        operation: 'put',
        version: 2,
        data: { id: searchIdOf('食べる'), query: '食べる', searchedAt: at(9) }
      }
    ])
  })

  test('a query takes the ID of its NFC form, and one whose ID is another query is refused', async () => {
    const learner = await accounts.learner('search-nfc@example.com')
    const decomposed = '\u30ab\u3099'
    expect(searchIdOf(decomposed)).toBe(searchIdOf('ガ'))
    const answer = await results(learner, search(decomposed, 0, at(0)), {
      ...search('見る', 0, at(0)),
      entityId: searchIdOf('観る')
    })
    expect(answer.map(result => result.error?.code ?? result.status)).toEqual([
      'applied',
      'invalid_mutation'
    ])
    expect((await changesOf(learner))[0]?.data).toMatchObject({ query: 'ガ' })
  })

  test('a removal wins over a search that had not seen it, and a search after seeing it brings it back', async () => {
    const learner = await accounts.learner('search-removed@example.com')
    await results(learner, search('猫', 0, at(0)))
    expect(await results(learner, remove('猫'), remove('犬'))).toMatchObject([
      { status: 'applied', version: 2 },
      { status: 'applied', version: 0 }
    ])
    expect(await results(learner, search('猫', 1, at(30)))).toMatchObject([
      { status: 'conflict', version: 2, current: { operation: 'delete', data: null } }
    ])
    expect(
      await rows(
        `select query, searched_at, status from recent_searches where user_id = '${learner.userId}'`
      )
    ).toEqual([{ query: null, searched_at: null, status: 'removed' }])
    expect(await results(learner, search('猫', 2, at(31)))).toMatchObject([
      { status: 'applied', version: 3 }
    ])
  })

  test('keeps the 50 latest: the 51st prunes the oldest as a delete, and searching it again brings it back', async () => {
    const learner = await accounts.learner('search-bounded@example.com')
    const queries = Array.from({ length: 51 }, (_, n) => `query ${n}`)
    for (let start = 0; start < queries.length; start += 25) {
      await results(
        learner,
        ...queries.slice(start, start + 25).map((query, n) => search(query, 0, at(start + n)))
      )
    }
    const changes = await changesOf(learner)
    expect(changes.filter(change => change.operation === 'put')).toHaveLength(50)
    expect(changes.find(change => change.entityId === searchIdOf('query 0'))).toMatchObject({
      operation: 'delete',
      version: 2
    })
    expect(await results(learner, search('query 0', 0, at(100)))).toMatchObject([
      { status: 'applied', version: 3 }
    ])
    expect(
      (await changesOf(learner)).find(change => change.entityId === searchIdOf('query 1'))
    ).toMatchObject({ operation: 'delete' })
  })

  test('remembers the latest 100 searches it removed or pruned, and forgets older ones', async () => {
    const learner = await accounts.learner('search-forgets@example.com')
    await rows(
      `insert into recent_searches (user_id, id, status, version, updated_at) select '${learner.userId}', md5(n::text) || md5(n::text), 'removed', 2, now() - make_interval(mins => n) from generate_series(1, 100) as n`
    )
    await results(learner, search('新しい', 0, at(0)))
    await results(learner, remove('新しい'))
    const [kept] = await rows(
      `select count(*)::int as n from recent_searches where user_id = '${learner.userId}'`
    )
    expect(kept).toEqual({ n: 100 })
  })

  test('refuses a bad ID or fields, and a search without baseVersion', async () => {
    const learner = await accounts.learner('search-fields@example.com')
    const answer = await results(
      learner,
      { ...search('x', 0, at(0)), entityId: 'not-a-hash' },
      search('', 0, at(0)),
      search('a\u0007b', 0, at(0)),
      search('長'.repeat(1_001), 0, at(0)),
      search('ok', 0, '1999-12-31T23:59:59Z'),
      { ...search('ok', 0, at(0)), fields: { query: 'ok', searchedAt: at(0), from: 'Search' } },
      { ...search('ok', 0, at(0)), baseVersion: undefined }
    )
    expect(answer.map(result => result.error?.code)).toEqual([
      'invalid_mutation',
      'invalid_fields',
      'invalid_fields',
      'invalid_fields',
      'invalid_fields',
      'invalid_fields',
      'invalid_mutation'
    ])
  })
})

test('two devices converge on recent searches through searches and removals', async () => {
  const learner = await accounts.learner('search-converge@example.com')
  const phone = new SyncClient(accounts, learner.token)
  const pad = new SyncClient(accounts, learner.token)
  const fields = (query: string, minutes: number) => ({ query, searchedAt: at(minutes) })
  for (const [n, query] of ['一', '二', '三'].entries()) {
    phone.change('recentSearch', 'search', searchIdOf(query), fields(query, n))
  }
  await phone.sync()
  await pad.sync()

  pad.change('recentSearch', 'remove', searchIdOf('二'))
  pad.change('recentSearch', 'search', searchIdOf('三'), fields('三', 20))
  phone.change('recentSearch', 'search', searchIdOf('二'), fields('二', 10))
  await pad.sync()
  await phone.sync()
  await pad.sync()

  expect(pad.state()).toEqual(phone.state())
  expect(phone.dataOf('recentSearch', searchIdOf('二'))).toBeNull()
  expect(phone.dataOf('recentSearch', searchIdOf('三'))).toMatchObject({ searchedAt: at(20) })
  const fresh = new SyncClient(accounts, learner.token)
  await fresh.sync()
  expect(fresh.state()).toEqual(phone.state())
})
