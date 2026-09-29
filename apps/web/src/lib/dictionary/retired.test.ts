import { describe, expect, test, vi } from 'vitest'
import { d1RetiredLookup, retiredWordResponse, retiredWordsLookup } from './retired'

// Fixture rows for `retired_ids` until the pipeline (#463) records real ones: 1000010 is retired
// with no replacement, 1000020 is replaced by 1259290 (見る), and 1000030's replacement isn't in
// this release.
const retiredIds = [
  { ent_seq: 1000010, replacement_ent_seq: null },
  { ent_seq: 1000020, replacement_ent_seq: 1259290 },
  { ent_seq: 1000030, replacement_ent_seq: 9999999 }
]
const slugs = new Map([[1259290, '見る']])

/** A dictionary D1 holding the fixture rows; `failing` makes every query fail. */
function fakeD1({ failing = false } = {}) {
  const prepare = vi.fn((sql: string) => ({
    all: async () => {
      if (failing) throw new Error('D1_ERROR: Network connection lost.')
      if (!sql.includes('retired_ids')) throw new Error(`unexpected ${sql}`)
      return { results: retiredIds }
    },
    bind: (entSeq: number) => ({
      first: async () => (slugs.has(entSeq) ? { slug: slugs.get(entSeq) } : null)
    })
  }))
  return { prepare } as unknown as D1Database & { prepare: typeof prepare }
}

const at = (path: string) => new URL(`https://staging.zenbujapanese.com${path}`)

describe('retiredWordResponse', () => {
  test('a retired word with no replacement is gone (410), and kept out of search engines', async () => {
    const response = await retiredWordResponse(
      at('/dictionary/1000010/'),
      d1RetiredLookup(fakeD1())
    )
    expect(response?.status).toBe(410)
    expect(response?.headers.get('X-Robots-Tag')).toBe('noindex')
  })

  test('under any slug', async () => {
    const response = await retiredWordResponse(
      at(`/dictionary/${encodeURIComponent('旧')}-1000010/`),
      d1RetiredLookup(fakeD1())
    )
    expect(response?.status).toBe(410)
  })

  test('a replaced word redirects (308) to its replacement, in one hop to the canonical URL', async () => {
    const response = await retiredWordResponse(
      at('/dictionary/old-1000020/'),
      d1RetiredLookup(fakeD1())
    )
    expect(response?.status).toBe(308)
    expect(response?.headers.get('Location')).toBe(
      'https://staging.zenbujapanese.com/dictionary/%E8%A6%8B%E3%82%8B-1259290/'
    )
  })

  test('a replacement this release lacks leaves the word gone', async () => {
    const response = await retiredWordResponse(
      at('/dictionary/1000030/'),
      d1RetiredLookup(fakeD1())
    )
    expect(response?.status).toBe(410)
  })

  test.each([
    '/dictionary/%E8%A6%8B%E3%82%8B-1259290/',
    '/dictionary/999999999/',
    '/dictionary/kanji/%E8%A6%8B/',
    '/dictionary/search/eat/',
    '/dictionary/',
    '/sitemaps/dictionary/1.xml'
  ])('leaves %s to the app', async path => {
    expect(await retiredWordResponse(at(path), d1RetiredLookup(fakeD1()))).toBeNull()
  })

  test('reads retired_ids once per database', async () => {
    const db = fakeD1()
    const lookup = d1RetiredLookup(db)
    await retiredWordResponse(at('/dictionary/1000010/'), lookup)
    await retiredWordResponse(at('/dictionary/1259290/'), lookup)
    const reads = db.prepare.mock.calls.filter(([sql]) => sql.includes('retired_ids'))
    expect(reads).toHaveLength(1)
  })

  test('a database that fails leaves the request to the app, which reports the failure', async () => {
    const db = fakeD1({ failing: true })
    expect(await retiredWordResponse(at('/dictionary/1000010/'), d1RetiredLookup(db))).toBeNull()
  })
})

describe('retiredWordsLookup', () => {
  test('wherever a dictionary database is bound, production included', () => {
    expect(retiredWordsLookup({ DICTIONARY_DB: fakeD1() })).not.toBeNull()
    expect(retiredWordsLookup({})).toBeNull()
  })
})
