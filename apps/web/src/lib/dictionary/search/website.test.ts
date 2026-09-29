import {
  DictionarySearch,
  type SearchResults,
  searchFeatures
} from '@zenbu/dictionary-core/search/search'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { websiteCapabilities, websiteSearch } from './website'

const cachedResults = { items: [], resultLimit: 'cached' } as unknown as SearchResults
const coreResults = { items: [], resultLimit: 'core' } as unknown as SearchResults

/** A D1 whose search_cache holds only い, recording every statement it runs. */
function fakeD1(statements: string[]) {
  return {
    prepare(sql: string) {
      statements.push(sql)
      const statement = {
        bind: (...params: unknown[]) => ({
          ...statement,
          first: async () =>
            params[0] === 'い' ? { results: JSON.stringify(cachedResults) } : null
        }),
        all: async () => ({ results: sql.includes('search_cache') ? [{ query: 'い' }] : [] })
      }
      return statement
    }
  } as unknown as D1Database
}

test('the website supplies no analyzer, so it has no sentence search', () => {
  expect(searchFeatures(websiteCapabilities).sentenceSearch).toBe(false)
})

describe('websiteSearch', () => {
  afterEach(() => vi.restoreAllMocks())

  test('answers a precomputed query from search_cache, by its normalized form', async () => {
    const core = vi.spyOn(DictionarySearch.prototype, 'search').mockResolvedValue(coreResults)
    const statements: string[] = []
    const search = websiteSearch(fakeD1(statements))
    expect(await search.search(' い ')).toEqual(cachedResults)
    expect(core).not.toHaveBeenCalled()
    expect(statements).toEqual([
      'SELECT query FROM search_cache',
      'SELECT results FROM search_cache WHERE query = ?'
    ])
  })

  test('runs the core for any other query, without a cache lookup', async () => {
    const core = vi.spyOn(DictionarySearch.prototype, 'search').mockResolvedValue(coreResults)
    const statements: string[] = []
    const db = fakeD1(statements)
    expect(await websiteSearch(db).search('eat')).toEqual(coreResults)
    expect(await websiteSearch(db).search('water')).toEqual(coreResults)
    expect(core).toHaveBeenCalledTimes(2)
    // The cached queries are read once per database, not per search.
    expect(statements).toEqual(['SELECT query FROM search_cache'])
  })
})
