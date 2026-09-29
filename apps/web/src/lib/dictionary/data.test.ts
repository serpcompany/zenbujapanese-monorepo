import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { searchDictionary, summarizeSearchEntry } from './data'
import type { SearchEntry, SearchResults } from './search/search'
import { websiteSearch } from './search/website'

const env: { SEARCH_DB?: D1Database } = {}
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: async () => ({ env }) }))
vi.mock('./search/website', () => ({ websiteSearch: vi.fn() }))

const taberu: SearchEntry = {
  id: '0a1b',
  sourceRecordId: 1358280,
  headword: '食べる',
  reading: 'たべる',
  summary: 'to eat',
  partsOfSpeech: ['v1', 'vt']
}

function results(entries: SearchEntry[]): SearchResults {
  return { items: entries.map(entry => ({ entry })) } as unknown as SearchResults
}

/** A search D1 that has the import's tables when `tables` and a finished import when `imported`. */
function fakeD1({ tables, imported }: { tables: boolean; imported: boolean }) {
  return {
    prepare: (sql: string) => ({
      first: async () => {
        if (sql.includes('sqlite_master')) return tables ? { 1: 1 } : null
        if (!tables) throw new Error('D1_ERROR: no such table: dictionary_import')
        return imported ? { 1: 1 } : null
      }
    })
  } as unknown as D1Database
}

describe('summarizeSearchEntry', () => {
  test('maps a search result to a word by its JMdict entry number', () => {
    expect(summarizeSearchEntry(taberu)).toEqual({
      entSeq: 1358280,
      headword: '食べる',
      reading: 'たべる',
      ruby: [{ text: '食', reading: 'た' }, { text: 'べる' }],
      summary: 'to eat',
      path: '/dictionary/食べる-1358280/',
      frequency: []
    })
  })
})

describe('searchDictionary', () => {
  const search = vi.fn<(query: string) => Promise<SearchResults>>()

  beforeEach(() => {
    vi.mocked(websiteSearch).mockReturnValue({ search })
  })

  afterEach(() => {
    delete env.SEARCH_DB
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  test('searches the search database when it holds an import', async () => {
    env.SEARCH_DB = fakeD1({ tables: true, imported: true })
    search.mockResolvedValue(results([taberu]))
    const data = await searchDictionary('eat')
    expect(search).toHaveBeenCalledWith('eat')
    expect(data.words.map(word => word.entSeq)).toEqual([1358280])
    expect(data.kanji).toBeNull()
  })

  test('keeps the fixture kanji card with results from the search database', async () => {
    env.SEARCH_DB = fakeD1({ tables: true, imported: true })
    search.mockResolvedValue(results([taberu]))
    const data = await searchDictionary('要')
    expect(data.kanji?.path).toBe('/dictionary/kanji/要/')
    expect(data.words.map(word => word.entSeq)).toEqual([1358280])
  })

  test.each([
    ['without a search database', undefined],
    ['when the search database has no tables', fakeD1({ tables: false, imported: false })],
    ['before the import finishes', fakeD1({ tables: true, imported: false })]
  ])('searches the fixtures %s', async (_, db) => {
    env.SEARCH_DB = db
    const data = await searchDictionary('いる')
    expect(websiteSearch).not.toHaveBeenCalled()
    expect(data.words.map(word => word.entSeq)).toEqual([
      1546640, 1577980, 1391500, 1465580, 1322180, 1587780
    ])
  })

  test('shows a search that throws as no results', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    env.SEARCH_DB = fakeD1({ tables: true, imported: true })
    search.mockRejectedValue(new Error('D1_ERROR: fts5: syntax error'))
    expect((await searchDictionary('いる')).words).toEqual([])
    expect(console.error).toHaveBeenCalled()
  })

  test('shows a database that fails before searching as no results', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    env.SEARCH_DB = {
      prepare: () => ({
        first: async () => {
          throw new Error('D1_ERROR: network')
        }
      })
    } as unknown as D1Database
    expect((await searchDictionary('いる')).words).toEqual([])
    expect(websiteSearch).not.toHaveBeenCalled()
  })
})
