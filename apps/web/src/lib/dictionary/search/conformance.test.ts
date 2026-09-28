import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { getPlatformProxy } from 'wrangler'
import { DictionarySearch, d1SearchDatabase } from './search'

// The ADR 0006 conformance suite: every client must return these Language Reference IDs in
// this order. It runs against a local D1 built by scripts/load-search-d1.sh, so it only runs
// when ZENBU_SEARCH_D1=1.
const suitePath = new URL(
  '../../../../../ios/LanguageData/Conformance/search-retrieval.json',
  import.meta.url
)

interface ConformanceCase {
  query: string
  resolution?: string
  presentation?: string
  readingRefinement?: string
  results?: { id: string; headword: string; reading: string }[]
}

const suite: { resultLimit: number; cases: ConformanceCase[] } = JSON.parse(
  readFileSync(suitePath, 'utf8')
)

describe.runIf(process.env.ZENBU_SEARCH_D1 === '1')('search conformance on D1', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<CloudflareEnv>>>
  let search: DictionarySearch

  beforeAll(async () => {
    proxy = await getPlatformProxy<CloudflareEnv>({ persist: { path: '.search-d1/v3' } })
    search = new DictionarySearch(d1SearchDatabase(proxy.env.DB))
  })

  afterAll(async () => {
    await proxy?.dispose()
  })

  test.each(suite.cases)('「$query」', async expected => {
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
})
