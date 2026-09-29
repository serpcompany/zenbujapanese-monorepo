import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { getPlatformProxy } from 'wrangler'
import { findBroadPrefixes, porterStems, wordPrefixes } from './broad'
import { DictionarySearch, type SearchDatabase } from './search'
import { websiteCapabilities } from './website'

/** A database that answers wordPrefixes' two statements. */
const words = (romaji: string[], meanings: string[]): SearchDatabase => ({
  async all<Row>(sql: string) {
    const rows = sql.includes('forms')
      ? romaji.map(form => ({ form }))
      : meanings.map(text => ({ text }))
    return rows as Row[]
  }
})

describe('wordPrefixes', () => {
  test('lists every ASCII prefix of each FTS5 word, shortest first', async () => {
    const prefixes = await wordPrefixes(words(['Ta-be'], ['a café', 'to eat (x2)']))
    expect(prefixes).toEqual([
      'a',
      'b',
      'c',
      'e',
      't',
      'x',
      'be',
      'ca',
      'ea',
      'ta',
      'to',
      'x2',
      'caf',
      'eat'
    ])
  })
})

describe('porterStems', () => {
  test('stems each prefix as gloss_fts stems a query', () => {
    const stems = porterStems(['ti', 'tie', 'ties', 'hoping', 'personalization'])
    expect(Object.fromEntries(stems)).toEqual({
      ti: 'ti',
      tie: 'tie',
      ties: 'ti',
      hoping: 'hope',
      personalization: 'person'
    })
  })
})

describe('findBroadPrefixes', () => {
  // t* is broad; ti* reads 100, tie* 50. ties* stems to ti, so it matches what ti* does: its
  // shorter prefix tie doesn't bound it, but ti does. tim*, time*, and timer* are bounded by ti.
  const prefixes = ['t', 'ti', 'tie', 'tim', 'ties', 'time', 'timer']
  const stems = new Map([
    ['t', 't'],
    ['ti', 'ti'],
    ['tie', 'tie'],
    ['tim', 'tim'],
    ['ties', 'ti'],
    ['time', 'time'],
    ['timer', 'timer']
  ])
  const rows: Record<string, number> = { t: 5000, ti: 100, tie: 50, tim: 60, ties: 100 }

  test('searches only prefixes no shorter narrow one bounds, and finds the broad ones', async () => {
    const searchedFor: string[] = []
    const outcome = await findBroadPrefixes(
      prefixes,
      stems,
      async prefix => {
        searchedFor.push(prefix)
        return rows[prefix]
      },
      1000
    )
    expect(outcome.broad).toEqual(['t'])
    expect(searchedFor).toEqual(['t', 'ti'])
    expect(outcome.proven).toBe(5)
  })

  test("searches a prefix whose stem is shorter than a narrow prefix's", async () => {
    // With ti broad, only tie bounds its extensions, and ties* stems past it.
    const searchedFor: string[] = []
    const outcome = await findBroadPrefixes(
      prefixes,
      stems,
      async prefix => {
        searchedFor.push(prefix)
        return prefix === 'ti' ? 2000 : rows[prefix]
      },
      1000
    )
    expect(searchedFor).toEqual(['t', 'ti', 'tie', 'tim', 'ties'])
    expect(outcome.broad).toEqual(['t', 'ti'])
  })

  test('needs every prefix after its own prefixes', async () => {
    await expect(findBroadPrefixes(['ti', 't'], stems, async () => 0)).rejects.toThrow(
      'ti comes before its prefix t'
    )
  })
})

// The check on the search import's local copy (scripts/release-d1/search/database.sh's
// check_local), so it only runs when ZENBU_SEARCH_D1=1: no wildcard search reads more than
// `rowsReadThreshold` rows uncached. It runs findBroadPrefixes over every prefix of a romaji or
// English word again, as the website searches: a prefix whose `p*` is in search_cache counts as
// broad, and every other one it searches must read at most the threshold. findBroadPrefixes
// proves the rest narrow by a shorter one it searched, and `^p*` reads what `p*` does, so each
// `p*` in the cache needs its `^p*` there too.
const enabled = process.env.ZENBU_SEARCH_D1 === '1'

describe.runIf(enabled)('broad searches on D1', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<CloudflareEnv>>>
  let d1: D1Database
  let rowsRead = 0
  let db: SearchDatabase
  let cachedQueries: Set<string>

  beforeAll(async () => {
    proxy = await getPlatformProxy<CloudflareEnv>({
      persist: { path: `${process.env.ZENBU_SEARCH_D1_PATH ?? '.search-d1'}/v3` }
    })
    const bound = proxy.env.SEARCH_DB
    if (!bound) throw new Error('wrangler.jsonc has no local SEARCH_DB binding')
    d1 = bound
    db = {
      async all<Row>(sql: string, params: readonly (string | number)[]) {
        const { results, meta } = await d1
          .prepare(sql)
          .bind(...params)
          .all<Row>()
        rowsRead += meta.rows_read ?? 0
        return results
      }
    }
    const { results } = await d1.prepare('SELECT query FROM search_cache').all<{ query: string }>()
    cachedQueries = new Set(results.map(row => row.query))
  })

  afterAll(async () => {
    await proxy?.dispose()
  })

  test('no romaji form has a *, so a wildcard search is never an exact romaji match', async () => {
    const [row] = await db.all<{ count: number }>(
      "SELECT count(*) AS count FROM forms WHERE kind = 2 AND instr(form, '*') > 0",
      []
    )
    expect(row.count).toBe(0)
  })

  test('no wildcard search of a word prefix reads over the threshold uncached', async () => {
    const search = new DictionarySearch(db, websiteCapabilities)
    const prefixes = await wordPrefixes(db)
    const { broad, searched } = await findBroadPrefixes(
      prefixes,
      porterStems(prefixes),
      async prefix => {
        if (cachedQueries.has(`${prefix}*`)) return Number.POSITIVE_INFINITY
        rowsRead = 0
        await search.search(`${prefix}*`)
        return rowsRead
      }
    )
    const uncached = broad
      .filter(prefix => searched.get(prefix) !== Number.POSITIVE_INFINITY)
      .map(prefix => `${prefix}* (${searched.get(prefix)} rows)`)
    expect(uncached, 'wildcard searches over the threshold that search_cache lacks').toEqual([])
    const withoutCaret = broad.filter(prefix => !cachedQueries.has(`^${prefix}*`))
    expect(
      withoutCaret.map(prefix => `^${prefix}*`),
      '^ forms that search_cache lacks'
    ).toEqual([])
    // The cache holds the wildcards that were broad when it was built: t* and ^t* at least.
    expect(broad).toContain('t')
  }, 1_800_000)

  test('the cached wildcard searches are what the core finds', async () => {
    // A spread of them, from t* to the narrowest; each broad search takes up to 4 s.
    const search = new DictionarySearch(db, websiteCapabilities)
    const wildcards = [...cachedQueries].filter(query => query.endsWith('*')).sort()
    const sample = wildcards.filter((_, index) => index % Math.ceil(wildcards.length / 12) === 0)
    for (const query of ['t*', '^t*', ...sample]) {
      const row = await d1
        .prepare('SELECT results FROM search_cache WHERE query = ?')
        .bind(query)
        .first<{ results: string }>()
      expect(JSON.parse(row?.results ?? 'null'), query).toEqual(await search.search(query))
    }
  }, 600_000)
})
