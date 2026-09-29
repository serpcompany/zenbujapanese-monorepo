import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fixtureKanjiRows, fixtureWordRows } from '@/lib/dictionary/fixtures'
import {
  getKanjiPage,
  getWordPage,
  isUnreadableQuery,
  searchDictionary,
  summarizeSearchEntry
} from './data'
import type { FrequencyRow } from './detail/rows'
import { type DictionaryKanji, type DictionaryWord, dictionaryDatabase } from './dictionary-db'
import type { SearchEntry, SearchResultItem, SearchResults } from './search/search'
import { websiteSearch } from './search/website'

const env: { SEARCH_DB?: D1Database; DICTIONARY_DB?: D1Database } = {}
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: async () => ({ env }) }))
vi.mock('./search/website', () => ({ websiteSearch: vi.fn() }))
vi.mock('./dictionary-db', () => ({ dictionaryDatabase: vi.fn() }))

/** 食べる as the core returns it for "eat", with its Language Reference ID. */
const eat: SearchResultItem = {
  entry: {
    id: '042e07f7052f611fed33ddddf37f55fd',
    sourceRecordId: 1358280,
    headword: '食べる',
    reading: 'たべる',
    summary: 'to eat',
    partsOfSpeech: ['v1', 'vt']
  },
  sourceOrder: 0,
  matchRank: {
    kind: 'english',
    lane: 0,
    corroborationRank: 0,
    romajiSpecificityRank: 0,
    senseOrder: 0,
    priorityPresenceRank: 0,
    relation: 0,
    priorityProfile: { primaryMask: 3, secondaryMask: 0, newsFrequencyBand: 2 },
    glossOrder: 0,
    headwordLength: 3,
    semanticFingerprint: 'eat'
  },
  fallbackOrder: 0,
  matchedSummary: 'to eat'
}

/** 要る, which has a fixture word page. */
const iru: SearchEntry = {
  id: '0a1b',
  sourceRecordId: 1546640,
  headword: '要る',
  reading: 'いる',
  summary: 'to be needed',
  partsOfSpeech: ['v5r']
}

function results(entries: SearchEntry[]): SearchResults {
  return { items: entries.map(entry => ({ entry })) } as unknown as SearchResults
}

/** A search D1 that has the import's tables when `tables` and a finished import when `imported`. */
function fakeD1({ tables, imported }: { tables: boolean; imported: boolean }) {
  const state = { tables, imported }
  const db = {
    state,
    prepare: vi.fn((sql: string) => ({
      first: async () => {
        if (sql.includes('sqlite_master')) return state.tables ? { 1: 1 } : null
        if (!state.tables) throw new Error('D1_ERROR: no such table: dictionary_import')
        return state.imported ? { 1: 1 } : null
      }
    }))
  }
  return db as typeof db & D1Database
}

/** A D1 whose every query fails. */
function failingD1() {
  return {
    prepare: () => ({
      first: async () => {
        throw new Error('D1_ERROR: Network connection lost.')
      }
    })
  } as unknown as D1Database
}

describe('summarizeSearchEntry', () => {
  test("maps the core's result to a word by its JMdict entry number", () => {
    expect(summarizeSearchEntry(eat.entry)).toEqual({
      entSeq: 1358280,
      headword: '食べる',
      reading: 'たべる',
      ruby: [{ text: '食', reading: 'た' }, { text: 'べる' }],
      summary: 'to eat',
      // No word page for 食べる until #465.
      path: null,
      frequency: []
    })
  })

  test('links a word that has a page', () => {
    expect(summarizeSearchEntry(iru).path).toBe('/dictionary/要る-1546640/')
  })

  test('links every word once the dictionary database is loaded', () => {
    expect(summarizeSearchEntry(eat.entry, true).path).toBe('/dictionary/食べる-1358280/')
  })
})

describe('isUnreadableQuery', () => {
  test.each([
    'D1_ERROR: fts5: syntax error near "\u0000"',
    'D1_ERROR: unterminated string',
    'D1_ERROR: malformed MATCH expression: [eat"]'
  ])('reads %s as an unreadable query', message => {
    expect(isUnreadableQuery(new Error(message))).toBe(true)
    expect(isUnreadableQuery(new Error('D1_ERROR', { cause: new Error(message) }))).toBe(true)
  })

  test.each([
    'D1_ERROR: Network connection lost.',
    'D1_ERROR: no such table: entries',
    // A SQL bug in the core must fail loudly, not show as no results.
    'D1_ERROR: near "SELEC": syntax error'
  ])('reads %s as a database failure', message => {
    expect(isUnreadableQuery(new Error(message))).toBe(false)
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
  })

  test('searches the search database when it holds an import', async () => {
    env.SEARCH_DB = fakeD1({ tables: true, imported: true })
    search.mockResolvedValue(results([eat.entry, iru]))
    const data = await searchDictionary('eat')
    expect(search).toHaveBeenCalledWith('eat')
    expect(data.words.map(word => [word.entSeq, word.path])).toEqual([
      [1358280, null],
      [1546640, '/dictionary/要る-1546640/']
    ])
    expect(data.kanji).toBeNull()
  })

  test('keeps the fixture kanji card with results from the search database', async () => {
    env.SEARCH_DB = fakeD1({ tables: true, imported: true })
    search.mockResolvedValue(results([eat.entry]))
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

  test('remembers only a finished import', async () => {
    const db = fakeD1({ tables: true, imported: false })
    env.SEARCH_DB = db
    search.mockResolvedValue(results([eat.entry]))
    await searchDictionary('eat')
    expect(websiteSearch).not.toHaveBeenCalled()
    // The import finishes; the next request checks again and searches it.
    db.state.imported = true
    await searchDictionary('eat')
    expect(websiteSearch).toHaveBeenCalledTimes(1)
    // Once found, the import isn't checked again.
    db.prepare.mockClear()
    await searchDictionary('eat')
    expect(db.prepare).not.toHaveBeenCalled()
    expect(websiteSearch).toHaveBeenCalledTimes(2)
  })

  test('shows a query full-text search cannot read as no results', async () => {
    env.SEARCH_DB = fakeD1({ tables: true, imported: true })
    search.mockRejectedValue(new Error('D1_ERROR: fts5: syntax error near "\u0000"'))
    expect((await searchDictionary('a\u0000b')).words).toEqual([])
  })

  test('fails when the search itself fails', async () => {
    env.SEARCH_DB = fakeD1({ tables: true, imported: true })
    search.mockRejectedValue(new Error('D1_ERROR: Network connection lost.'))
    await expect(searchDictionary('eat')).rejects.toThrow('Network connection lost')
  })

  test('fails when the database fails before searching, even for a fixture kanji', async () => {
    // Otherwise 要 would render its kanji card with no words: an indexable empty page.
    env.SEARCH_DB = failingD1()
    await expect(searchDictionary('要')).rejects.toThrow('Network connection lost')
    expect(websiteSearch).not.toHaveBeenCalled()
  })
})

describe('word and kanji pages', () => {
  const word = vi.fn<(entSeq: number) => Promise<DictionaryWord | null>>()
  const kanji = vi.fn<(character: string) => Promise<DictionaryKanji | null>>()
  const frequency = vi.fn<(entSeqs: readonly number[]) => Promise<Map<number, FrequencyRow[]>>>()
  const kanjiCard =
    vi.fn<(character: string) => Promise<{ character: string; meanings: string[] } | null>>()
  const iruRows = fixtureWordRows.find(rows => rows.entry.entSeq === 1546640)
  const kanameRows = fixtureKanjiRows.find(rows => rows.kanji.character === '要')

  beforeEach(() => {
    frequency.mockResolvedValue(new Map())
    vi.mocked(dictionaryDatabase).mockReturnValue({ word, kanji, kanjiCard, frequency })
  })

  afterEach(() => {
    delete env.DICTIONARY_DB
    delete env.SEARCH_DB
    vi.clearAllMocks()
  })

  test.each([
    ['without a dictionary database', undefined],
    ['when it has no tables', fakeD1({ tables: false, imported: false })],
    ['before its import finishes', fakeD1({ tables: true, imported: false })]
  ])('read the fixtures %s', async (_, db) => {
    env.DICTIONARY_DB = db
    expect((await getWordPage(1546640))?.path).toBe('/dictionary/要る-1546640/')
    // 食べる has no fixture.
    expect(await getWordPage(1358280)).toBeNull()
    expect((await getKanjiPage('要'))?.words).toHaveLength(24)
    expect(dictionaryDatabase).not.toHaveBeenCalled()
  })

  test('a word page reads the dictionary database and links by stored slugs', async () => {
    env.DICTIONARY_DB = fakeD1({ tables: true, imported: true })
    if (!iruRows) throw new Error('no fixture for 要る')
    word.mockResolvedValue({
      rows: {
        ...iruRows,
        entry: {
          ...iruRows.entry,
          relationships: [
            {
              headword: '居る',
              reading: 'いる',
              summary: 'to be',
              relation: 'See also',
              targetEntSeq: 1577980
            },
            {
              headword: '無い',
              reading: 'ない',
              summary: 'none',
              relation: 'Antonym',
              targetEntSeq: null
            }
          ]
        }
      },
      slug: '要る',
      relatedSlugs: new Map([[1577980, 'いる']]),
      kanjiPages: new Set(['要'])
    })
    const page = await getWordPage(1546640)
    expect(word).toHaveBeenCalledWith(1546640)
    expect(page?.path).toBe('/dictionary/要る-1546640/')
    expect(page?.slug).toBe('要る')
    expect(page?.kanji).toEqual([
      { character: '要', meaning: 'need, main point', path: '/dictionary/kanji/要/' }
    ])
    // A related word links under its own page's slug, not the relationship's headword.
    expect(page?.related.map(related => related.path)).toEqual(['/dictionary/いる-1577980/', null])
  })

  test('an unknown number has no word page, even when a fixture has it', async () => {
    env.DICTIONARY_DB = fakeD1({ tables: true, imported: true })
    word.mockResolvedValue(null)
    expect(await getWordPage(1546640)).toBeNull()
  })

  test('a kanji page reads the dictionary database', async () => {
    env.DICTIONARY_DB = fakeD1({ tables: true, imported: true })
    if (!kanameRows) throw new Error('no fixture for 要')
    kanji.mockResolvedValue({
      rows: kanameRows,
      indexable: false,
      wordSlugs: new Map(kanameRows.words.map(row => [row.entSeq, row.headword])),
      kanjiPages: new Set(['女'])
    })
    const page = await getKanjiPage('要')
    expect(kanji).toHaveBeenCalledWith('要')
    expect(page?.words[2].path).toBe('/dictionary/要る-1546640/')
    expect(page?.elements.map(element => [element.character, element.path])).toEqual([
      ['女', '/dictionary/kanji/女/'],
      ['覀', null]
    ])
    // The stored flag decides.
    expect(page?.indexable).toBe(false)
  })

  describe('deployed (SITE_ENV set)', () => {
    beforeEach(() => {
      vi.stubEnv('SITE_ENV', 'staging')
    })

    afterEach(() => {
      vi.unstubAllEnvs()
    })

    test.each([
      ['has no tables', fakeD1({ tables: false, imported: false })],
      ['has no finished import', fakeD1({ tables: true, imported: false })]
    ])('a bound database that %s fails the request instead of showing fixtures', async (_, db) => {
      env.DICTIONARY_DB = db
      await expect(getWordPage(1546640)).rejects.toThrow('DICTIONARY_DB is bound but holds no')
      await expect(getKanjiPage('要')).rejects.toThrow('DICTIONARY_DB is bound but holds no')
      delete env.DICTIONARY_DB
      env.SEARCH_DB = db
      await expect(searchDictionary('いる')).rejects.toThrow('SEARCH_DB is bound but holds no')
    })

    test('without the bindings, pages still read the fixtures', async () => {
      expect((await getWordPage(1546640))?.path).toBe('/dictionary/要る-1546640/')
      expect((await searchDictionary('いる')).words).toHaveLength(6)
    })
  })

  test('a failing dictionary database fails the request', async () => {
    env.DICTIONARY_DB = failingD1()
    await expect(getWordPage(1546640)).rejects.toThrow('Network connection lost')
    await expect(getKanjiPage('要')).rejects.toThrow('Network connection lost')
  })

  test('search links every word and reads the kanji card from the dictionary database', async () => {
    env.DICTIONARY_DB = fakeD1({ tables: true, imported: true })
    env.SEARCH_DB = fakeD1({ tables: true, imported: true })
    const search = vi.fn(async () => results([eat.entry]))
    vi.mocked(websiteSearch).mockReturnValue({ search })
    kanjiCard.mockResolvedValue({ character: '食', meanings: ['eat', 'food'] })
    const data = await searchDictionary('食')
    expect(kanjiCard).toHaveBeenCalledWith('食')
    expect(data.kanji).toEqual({
      character: '食',
      meanings: ['eat', 'food'],
      path: '/dictionary/kanji/食/'
    })
    expect(data.words.map(result => result.path)).toEqual(['/dictionary/食べる-1358280/'])
    // Only a one-character query can be a kanji.
    await searchDictionary('食べる')
    expect(kanjiCard).toHaveBeenCalledTimes(1)
  })

  test('search results show frequency chips from the dictionary database, in one query', async () => {
    env.DICTIONARY_DB = fakeD1({ tables: true, imported: true })
    env.SEARCH_DB = fakeD1({ tables: true, imported: true })
    vi.mocked(websiteSearch).mockReturnValue({ search: async () => results([eat.entry, iru]) })
    frequency.mockResolvedValue(
      new Map([
        [
          1358280,
          [
            { pack: 'jlpt', level: 5 },
            { pack: 'tubelex', rank: 189 }
          ]
        ],
        // Not in JLPT: SearchFrequencyRankPresentationModel leaves a level dictionary out.
        [1546640, [{ pack: 'tubelex', rank: 15_752 }]]
      ])
    )
    const data = await searchDictionary('eat')
    expect(frequency).toHaveBeenCalledTimes(1)
    expect(frequency).toHaveBeenCalledWith([1358280, 1546640])
    expect(
      data.words.map(result =>
        result.frequency.map(chip => `${chip.source} ${chip.value} ${chip.tier}`)
      )
    ).toEqual([['JLPT N5 veryCommon', 'YouTube 189 veryCommon'], ['YouTube 15,752 uncommon']])
  })

  test('search results have no chips without the dictionary database', async () => {
    env.SEARCH_DB = fakeD1({ tables: true, imported: true })
    vi.mocked(websiteSearch).mockReturnValue({ search: async () => results([eat.entry]) })
    const data = await searchDictionary('eat')
    expect(frequency).not.toHaveBeenCalled()
    expect(data.words[0].frequency).toEqual([])
  })
})
