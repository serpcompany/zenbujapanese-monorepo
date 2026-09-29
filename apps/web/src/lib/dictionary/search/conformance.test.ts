import { readFileSync } from 'node:fs'
import { searchFeatures } from '@zenbu/dictionary-core/search/search'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { getPlatformProxy } from 'wrangler'
import { type WebsiteSearch, websiteCapabilities, websiteSearch } from './website'

// The ADR 0006 conformance suite: every client must return these Language Reference IDs in
// this order. It runs against a local search D1 built by `scripts/release-d1/load-local.sh
// search` (at .search-d1/, or ZENBU_SEARCH_D1_PATH), so it only runs when ZENBU_SEARCH_D1=1. It
// searches as the website does, so precomputed broad queries answer from search_cache.
const enabled = process.env.ZENBU_SEARCH_D1 === '1'

interface ConformanceCase {
  query: string
  resolution?: string
  presentation?: string
  readingRefinement?: string
  results?: { id: string; headword: string; reading: string }[]
}

interface ConformanceSuite {
  artifact: { name: string; sha256: string }
  resultLimit: number
  cases: ConformanceCase[]
}

// Read only when the suite runs, so moving the file (#469) can't break `pnpm test`.
const suite: ConformanceSuite = enabled
  ? JSON.parse(
      readFileSync(
        new URL(
          '../../../../../ios/LanguageData/Conformance/search-retrieval.json',
          import.meta.url
        ),
        'utf8'
      )
    )
  : { artifact: { name: '', sha256: '' }, resultLimit: 0, cases: [] }

// The app records sentence search as the `analyzed` resolution, which the website leaves out.
const features = searchFeatures(websiteCapabilities)
const needsSentenceSearch = (expected: ConformanceCase) =>
  expected.resolution === 'analyzed' && !features.sentenceSearch
const supportedCases = suite.cases.filter(expected => !needsSentenceSearch(expected))
const unsupportedCases = suite.cases.filter(needsSentenceSearch)

describe.runIf(enabled)('search conformance on D1', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<CloudflareEnv>>>
  let search: WebsiteSearch

  beforeAll(async () => {
    proxy = await getPlatformProxy<CloudflareEnv>({
      persist: { path: `${process.env.ZENBU_SEARCH_D1_PATH ?? '.search-d1'}/v3` }
    })
    const db = proxy.env.SEARCH_DB
    if (!db) throw new Error('wrangler.jsonc has no local SEARCH_DB binding')
    const loaded = await db
      .prepare('SELECT artifact, sha256 FROM dictionary_import')
      .first<{ artifact: string; sha256: string }>()
      .catch(() => null)
    if (loaded?.sha256 !== suite.artifact.sha256) {
      throw new Error(
        `.search-d1 holds ${loaded ? `${loaded.artifact} ${loaded.sha256}` : 'no recorded artifact'}, ` +
          `but the suite pins ${suite.artifact.name} ${suite.artifact.sha256}. Rebuild it from ` +
          'that artifact with scripts/release-d1/load-local.sh search, or record the suite again.'
      )
    }
    search = websiteSearch(db)
  })

  afterAll(async () => {
    await proxy?.dispose()
  })

  if (supportedCases.length > 0) {
    test.each(supportedCases)('「$query」', async expected => {
      const started = performance.now()
      const results = await search.search(expected.query)
      const elapsed = Math.round(performance.now() - started)
      const observed = results.items.slice(0, suite.resultLimit).map(item => item.entry)
      const describeResults = (entries: { headword: string; reading: string }[]) =>
        entries.map(entry => `${entry.headword}（${entry.reading}）`).join(', ')

      expect(
        observed.map(entry => entry.id),
        `「${expected.query}」 in ${elapsed} ms: expected ${describeResults(expected.results ?? [])} but found ${describeResults(observed)}`
      ).toEqual((expected.results ?? []).map(result => result.id))
      expect(results.resolution).toBe(expected.resolution)
      expect(results.presentation).toBe(expected.presentation)
      expect(results.readingRefinement ?? undefined).toBe(expected.readingRefinement)
    })
  }

  if (unsupportedCases.length > 0) {
    test.skip.each(unsupportedCases)('「$query」 needs sentence search', () => {})
  }

  test('a duplicated word keeps the entry number of its Language Reference ID', async () => {
    // 欧州経済領域 is two JMdict entries with the same meaning. The lower Language Reference ID,
    // 4e9c02…, is entry 5149361, whichever query finds it and whichever row comes first.
    for (const query of ['欧州経済領域', 'european economic area']) {
      const item = (await search.search(query)).items.find(
        candidate => candidate.entry.headword === '欧州経済領域'
      )
      expect(item?.entry, query).toMatchObject({
        id: '4e9c02a00a028f7ea45ab9cc687ec4cf',
        sourceRecordId: 5149361
      })
    }
  })
})
