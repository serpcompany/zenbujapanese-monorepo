import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fixtureKanjiRows, fixtureWordRows } from '@/lib/dictionary/fixtures'
import {
  getConjugatedFormPage,
  getConjugationsPage,
  getFormExamples,
  getKanjiPage,
  getMoreSearchExamples,
  getSearchExamples,
  getSearchRows,
  getWordExamples,
  getWordPage,
  isUnreadableQuery,
  type SearchData,
  type SearchExamplesData,
  searchDictionary
} from './data'
import type { FrequencyRow } from './detail/rows'
import {
  type DictionaryConjugationWord,
  type DictionaryExamples,
  type DictionaryFormExamples,
  type DictionaryKanji,
  type DictionaryWord,
  dictionaryDatabase
} from './dictionary-db'
import {
  type ExampleEntry,
  type SearchSentenceRow,
  type WebsiteExampleSearch,
  websiteExampleSearch
} from './example-search'
import type { ExampleSearchResult } from './examples/search'
import type { SearchEntry, SearchResultItem, SearchResults } from './search/search'
import { websiteSearch } from './search/website'

const env: { SEARCH_DB?: D1Database; DICTIONARY_DB?: D1Database } = {}
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: async () => ({ env }) }))
vi.mock('./search/website', () => ({ websiteSearch: vi.fn() }))
vi.mock('./dictionary-db', () => ({ dictionaryDatabase: vi.fn() }))
vi.mock('./example-search', async original => ({
  ...(await original<typeof import('./example-search')>()),
  websiteExampleSearch: vi.fn()
}))

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

/** The core's results for these entries, in this order, each its own match group. */
function results(entries: SearchEntry[]): SearchResults {
  return {
    items: entries.map((entry, position) => ({
      ...eat,
      entry,
      sourceOrder: position,
      fallbackOrder: position,
      matchedSummary: null
    })),
    leadingLexicalEntryCount: entries.length,
    presentation: 'ranked',
    resolution: 'direct',
    readingRefinement: null,
    usesPrimaryEntryExamples: false,
    hasExactOrPrefixMatch: true
  }
}

/** The rows of a results screen; fails for no results. */
function rowsOf(data: SearchData) {
  if (data.state !== 'results') throw new Error(`no results for ${data.query}`)
  return data.rows
}

/**
 * A search D1 that has the import's tables when `tables` and a finished import when `imported`,
 * with `entry_frequency` rows by Language Reference ID.
 */
function fakeD1({
  tables,
  imported,
  frequency = {}
}: {
  tables: boolean
  imported: boolean
  frequency?: Record<string, FrequencyRow[]>
}) {
  const state = { tables, imported }
  const frequencyQueries: (string | number)[][] = []
  const db = {
    state,
    frequencyQueries,
    prepare: vi.fn((sql: string) => ({
      first: async () => {
        if (sql.includes('sqlite_master')) return state.tables ? { 1: 1 } : null
        if (!state.tables) throw new Error('D1_ERROR: no such table: dictionary_import')
        return state.imported ? { build_id: 'build-1' } : null
      },
      bind: (...params: (string | number)[]) => ({
        all: async () => {
          if (!sql.includes('entry_frequency')) throw new Error(`unexpected query: ${sql}`)
          frequencyQueries.push(params)
          return {
            results: params.flatMap(id =>
              frequency[id] ? [{ entry_id: id, frequency_json: JSON.stringify(frequency[id]) }] : []
            )
          }
        }
      })
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

/** Example search on a search database: each query's result, and each entry's examples. */
const exampleSearch = vi.fn<WebsiteExampleSearch['search']>()
const exampleEntry = vi.fn<WebsiteExampleSearch['entry']>()
const exampleSentences = vi.fn<WebsiteExampleSearch['sentences']>()
const noExampleResult: ExampleSearchResult = { ids: [], count: 0, truncated: false }

/** An entry as example search reads it, with `listed` examples numbered from 1. */
const exampleEntryOf = (entry: SearchEntry, listed: number): ExampleEntry => ({
  id: entry.id,
  entSeq: entry.sourceRecordId,
  writtenForms: [entry.headword],
  readingForms: [entry.reading],
  sentenceIds: Array.from({ length: listed }, (_, index) => index + 1)
})

/** A sentence 食べる appears in, split into its words as the import stores them. */
const sentence = (id: number): SearchSentenceRow => ({
  id,
  pairId: String(id).padStart(32, '0'),
  japanese: 'パンを食べた。',
  english: `I ate bread (${id}).`,
  words: [
    { n: 2, e: [1049020] },
    { n: 1, e: [2029010] },
    { n: 3, r: 'たべた', d: '食べる', e: [1358280], f: 'たべ' },
    { n: 1 }
  ],
  japaneseTatoebaId: id,
  japaneseContributor: null,
  japaneseLicense: 'CC BY 2.0 FR',
  englishTatoebaId: 100_000 + id,
  englishContributor: 'CK',
  englishLicense: 'CC BY 2.0 FR'
})

beforeEach(() => {
  vi.mocked(websiteExampleSearch).mockReturnValue({
    search: exampleSearch,
    entry: exampleEntry,
    sentences: exampleSentences
  })
  exampleSearch.mockResolvedValue(noExampleResult)
  exampleEntry.mockResolvedValue(null)
  exampleSentences.mockImplementation(async ids => ids.map(sentence))
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
    // Without the dictionary database, only fixture words have pages: none for 食べる.
    expect(rowsOf(data).map(word => [word.entSeq, word.path])).toEqual([
      [1358280, null],
      [1546640, '/dictionary/要る-1546640/']
    ])
    expect(data).toMatchObject({ kanji: null, readingRefinement: null })
  })

  test('shows the meaning an English query matched, and links the reading refinement', async () => {
    env.SEARCH_DB = fakeD1({ tables: true, imported: true })
    const found = results([iru])
    search.mockResolvedValue({
      ...found,
      items: [{ ...found.items[0], matchedSummary: 'to need' }],
      readingRefinement: 'いる'
    })
    const data = await searchDictionary('iru')
    expect(rowsOf(data)[0].summary).toBe('to need')
    expect(data).toMatchObject({
      readingRefinement: {
        query: 'いる',
        title: 'Search for「いる」',
        path: '/dictionary/search/%E3%81%84%E3%82%8B/'
      }
    })
  })

  test('re-sorts equally strong matches by frequency from the search database, in one query', async () => {
    const db = fakeD1({
      tables: true,
      imported: true,
      frequency: {
        [eat.entry.id]: [{ pack: 'jlpt', level: 1 }],
        // Not in JLPT: SearchFrequencyRankPresentationModel leaves a level dictionary out.
        [iru.id]: [
          { pack: 'jlpt', level: 5 },
          { pack: 'tubelex', rank: 949 }
        ]
      }
    })
    env.SEARCH_DB = db
    const found = results([eat.entry, iru])
    // One match group, so frequency decides: 要る (N5) before 食べる (N1).
    search.mockResolvedValue({
      ...found,
      items: found.items.map(item => ({ ...item, sourceOrder: 0 }))
    })
    const data = await searchDictionary('eat')
    expect(db.frequencyQueries).toEqual([[eat.entry.id, iru.id]])
    expect(
      rowsOf(data).map(row => [
        row.headword,
        row.chips.map(chip => `${chip.source} ${chip.value} ${chip.tier}`)
      ])
    ).toEqual([
      ['要る', ['JLPT N5 veryCommon', 'YouTube 949 veryCommon']],
      ['食べる', ['JLPT N1 moderate']]
    ])
  })

  test('leads a one-kanji query with the kanji row, linked to its fixture page', async () => {
    env.SEARCH_DB = fakeD1({ tables: true, imported: true })
    search.mockResolvedValue(results([eat.entry]))
    const data = await searchDictionary('要')
    expect(data).toMatchObject({
      kanji: { character: '要', label: 'KANJI', summary: 'to eat', path: '/dictionary/kanji/要/' }
    })
    expect(rowsOf(data).map(word => word.entSeq)).toEqual([1358280])
  })

  test('shows No Dictionary Matches when nothing matches', async () => {
    env.SEARCH_DB = fakeD1({ tables: true, imported: true })
    search.mockResolvedValue(results([]))
    expect(await searchDictionary('qzxvkj')).toEqual({ state: 'noResults', query: 'qzxvkj' })
  })

  test.each([
    ['without a search database', undefined],
    ['when the search database has no tables', fakeD1({ tables: false, imported: false })],
    ['before the import finishes', fakeD1({ tables: true, imported: false })]
  ])('searches the fixtures %s', async (_, db) => {
    env.SEARCH_DB = db
    const data = await searchDictionary('いる')
    expect(websiteSearch).not.toHaveBeenCalled()
    expect(rowsOf(data).map(word => word.entSeq)).toEqual([
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
    // Only the results' frequency is read.
    expect(db.prepare.mock.calls.map(([sql]) => sql)).toEqual([
      expect.stringContaining('FROM entry_frequency')
    ])
    expect(websiteSearch).toHaveBeenCalledTimes(2)
  })

  test('leads with the Example Sentences row and the app’s count, 50+ over 50', async () => {
    env.SEARCH_DB = fakeD1({ tables: true, imported: true })
    search.mockResolvedValue(results([eat.entry]))
    exampleSearch.mockResolvedValue({ ids: [1, 2], count: 51, truncated: true })
    const data = await searchDictionary('eat')
    expect(exampleSearch).toHaveBeenCalledWith('eat')
    expect(data).toMatchObject({
      sections: ['examples', 'results'],
      examples: {
        title: 'View 50+ Example Sentences',
        count: 51,
        primaryEntry: null,
        path: '/dictionary/search/eat/examples/'
      }
    })
  })

  test('counts the primary entry’s examples for a deinflected or romaji search', async () => {
    env.SEARCH_DB = fakeD1({ tables: true, imported: true })
    search.mockResolvedValue({ ...results([iru, eat.entry]), usesPrimaryEntryExamples: true })
    exampleEntry.mockResolvedValue(exampleEntryOf(iru, 3))
    const data = await searchDictionary('iru')
    // The primary entry: none is written "iru", so the first.
    expect(exampleEntry).toHaveBeenCalledWith(iru.id)
    expect(exampleSearch).not.toHaveBeenCalled()
    expect(data).toMatchObject({
      examples: { title: 'View 3 Example Sentences', count: 3, primaryEntry: iru.id }
    })
  })

  test('shows only the Example Sentences row when only sentences match', async () => {
    env.SEARCH_DB = fakeD1({ tables: true, imported: true })
    search.mockResolvedValue(results([]))
    exampleSearch.mockResolvedValue({ ids: [1], count: 1, truncated: false })
    expect(await searchDictionary('it is')).toMatchObject({
      state: 'results',
      sections: ['examples'],
      examples: { title: 'View 1 Example Sentence' },
      rows: [],
      wordCount: 0
    })
  })

  test('renders the first 25 words; the rows route serves the rest of this build only', async () => {
    env.SEARCH_DB = fakeD1({ tables: true, imported: true })
    const entries = Array.from({ length: 60 }, (_, index) => ({
      ...iru,
      id: `id${index}`,
      sourceRecordId: 2_000_000 + index
    }))
    search.mockResolvedValue(results(entries))
    const data = await searchDictionary('い')
    expect(rowsOf(data)).toHaveLength(25)
    expect(data).toMatchObject({
      wordCount: 60,
      rowsPath: '/dictionary/search/%E3%81%84/results.json?build=build-1'
    })
    exampleSearch.mockClear()
    exampleEntry.mockClear()
    const second = await getSearchRows('い', 25, 'build-1')
    const third = await getSearchRows('い', 50, 'build-1')
    // The rows route never counts example sentences.
    expect(exampleSearch).not.toHaveBeenCalled()
    expect(exampleEntry).not.toHaveBeenCalled()
    const listed = [...rowsOf(data), ...(second ?? []), ...(third ?? [])].map(row => row.entSeq)
    expect(listed).toEqual(entries.map(entry => entry.sourceRecordId))
    expect(await getSearchRows('い', 25, 'build-0')).toBeNull()
  })

  test('shows a query full-text search cannot read as no results', async () => {
    env.SEARCH_DB = fakeD1({ tables: true, imported: true })
    search.mockRejectedValue(new Error('D1_ERROR: fts5: syntax error near "\u0000"'))
    expect(await searchDictionary('a\u0000b')).toEqual({ state: 'noResults', query: 'a\u0000b' })
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

/** An Example Sentences page's data; fails without one. */
function page(data: SearchExamplesData | null): SearchExamplesData {
  if (!data) throw new Error('no Example Sentences page')
  return data
}

describe('a search’s Example Sentences page', () => {
  const search = vi.fn<(query: string) => Promise<SearchResults>>()

  beforeEach(() => {
    vi.mocked(websiteSearch).mockReturnValue({ search })
  })

  afterEach(() => {
    delete env.SEARCH_DB
    vi.clearAllMocks()
  })

  test('lists the sentences that contain the query, 25 at first, with each word linked', async () => {
    env.SEARCH_DB = fakeD1({ tables: true, imported: true })
    search.mockResolvedValue(results([eat.entry]))
    exampleEntry.mockResolvedValue(exampleEntryOf(eat.entry, 0))
    const ids = Array.from({ length: 60 }, (_, index) => index + 1)
    exampleSearch.mockResolvedValue({ ids, count: 51, truncated: false })
    const data = page(await getSearchExamples('食べた'))
    expect(data).toMatchObject({
      query: '食べた',
      listed: 60,
      // A direct Japanese search's page is indexed.
      indexable: true,
      examplesPath: '/dictionary/search/%E9%A3%9F%E3%81%B9%E3%81%9F/examples.json?build=build-1'
    })
    expect(data.examples.map(example => example.position)).toEqual(
      ids.slice(0, 25).map(id => id - 1)
    )
    const [first] = data.examples
    // 食べた is 食べる, the primary entry, with furigana over 食 and the query's words marked.
    expect(first.tokens.map(token => [token.text, token.link, token.isPageWord])).toEqual([
      ['パン', { entSeq: 1049020 }, false],
      ['を', { entSeq: 2029010 }, false],
      ['食べた', { entSeq: 1358280 }, true],
      ['。', null, false]
    ])
    expect(first.tokens[2].ruby).toEqual([{ text: '食', reading: 'た' }, { text: 'べた' }])
    expect(first.japanese).toEqual({ id: 1, contributor: null, license: 'CC BY 2.0 FR' })
    expect(first.english).toEqual({ id: 100_001, contributor: 'CK', license: 'CC BY 2.0 FR' })
  })

  test('loads the next 25 without repeating or skipping any, for its build only', async () => {
    env.SEARCH_DB = fakeD1({ tables: true, imported: true })
    search.mockResolvedValue(results([eat.entry]))
    const ids = Array.from({ length: 60 }, (_, index) => 1000 + index)
    exampleSearch.mockResolvedValue({ ids, count: 51, truncated: false })
    const first = page(await getSearchExamples('eat'))
    // Only a direct Japanese search's page is indexed.
    expect(first.indexable).toBe(false)
    const second = await getMoreSearchExamples('eat', 25, 'build-1')
    const third = await getMoreSearchExamples('eat', 50, 'build-1')
    const listed = [...first.examples, ...(second ?? []), ...(third ?? [])]
    expect(listed.map(example => example.japanese.id)).toEqual(ids)
    expect(listed.map(example => example.position)).toEqual(ids.map((_, index) => index))
    expect(await getMoreSearchExamples('eat', 25, 'build-0')).toBeNull()
  })

  test('lists the primary entry’s examples for a deinflected or romaji search', async () => {
    env.SEARCH_DB = fakeD1({ tables: true, imported: true })
    search.mockResolvedValue({ ...results([eat.entry]), usesPrimaryEntryExamples: true })
    exampleEntry.mockResolvedValue(exampleEntryOf(eat.entry, 3))
    const data = page(await getSearchExamples('taberu'))
    expect(exampleSearch).not.toHaveBeenCalled()
    expect(data.listed).toBe(3)
    expect(data.examples.map(example => example.japanese.id)).toEqual([1, 2, 3])
    // Its word page has these examples already.
    expect(data.indexable).toBe(false)
  })

  test('has no page without any sentence, which the app never opens', async () => {
    env.SEARCH_DB = fakeD1({ tables: true, imported: true })
    search.mockResolvedValue(results([]))
    expect(await getSearchExamples('qzxvkj')).toBeNull()
  })

  test('has no page without a search database', async () => {
    expect(await getSearchExamples('eat')).toBeNull()
  })
})

describe('word and kanji pages', () => {
  const word = vi.fn<(entSeq: number) => Promise<DictionaryWord | null>>()
  const kanji = vi.fn<(character: string) => Promise<DictionaryKanji | null>>()
  const kanjiCard =
    vi.fn<(character: string) => Promise<{ character: string; meanings: string[] } | null>>()
  const examples =
    vi.fn<(entSeq: number, from: number, limit: number) => Promise<DictionaryExamples | null>>()
  const conjugationWord = vi.fn<(entSeq: number) => Promise<DictionaryConjugationWord | null>>()
  const formExamples =
    vi.fn<(surface: string, from: number, limit: number) => Promise<DictionaryFormExamples>>()
  const iruRows = fixtureWordRows.find(rows => rows.entry.entSeq === 1546640)
  const kanameRows = fixtureKanjiRows.find(rows => rows.kanji.character === '要')

  beforeEach(() => {
    vi.mocked(dictionaryDatabase).mockReturnValue({
      word,
      examples,
      conjugationWord,
      formExamples,
      kanji,
      kanjiCard,
      // Sitemaps have their own tests (sitemaps.test.ts).
      wordSitemaps: vi.fn(),
      sitemapWords: vi.fn(),
      indexableKanji: vi.fn(),
      wordSlugs: vi.fn(),
      conjugationSitemap: vi.fn()
    })
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
      kanjiPages: new Set(['要']),
      exampleSlugs: new Map([[1546640, '要る']])
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
    // Example words link to their pages when the database names their slugs, and an ambiguous
    // word to a search for its dictionary form.
    const tokens = page?.examples.flatMap(example => example.tokens) ?? []
    expect(tokens.filter(token => token.isPageWord).map(token => token.path)).toContain(
      '/dictionary/要る-1546640/'
    )
    const choice = tokens.find(token => token.link && 'entSeqs' in token.link)
    expect(choice?.path).toMatch(/^\/dictionary\/search\//)
    expect(page?.examplesPath).toBe('/dictionary/examples/1546640.json?build=build-1')
  })

  test('a word page shows its first 25 examples, and the rest load 25 at a time', async () => {
    const page = await getWordPage(1546640)
    expect(page?.examples).toHaveLength(25)
    expect(page?.exampleCount?.listed).toBeGreaterThan(25)
    expect(page?.examplesPath).toBe('/dictionary/examples/1546640.json?build=fixtures')
    const more = await getWordExamples(1546640, 25, 'fixtures')
    expect(more?.map(example => example.position)).toEqual(
      Array.from({ length: more?.length ?? 0 }, (_, index) => 25 + index)
    )
    expect(await getWordExamples(1358280, 25, 'fixtures')).toBeNull()
  })

  test('more examples come from the dictionary database, linked by its slugs', async () => {
    env.DICTIONARY_DB = fakeD1({ tables: true, imported: true })
    if (!iruRows) throw new Error('no fixture for 要る')
    examples.mockResolvedValue({
      rows: iruRows.examples.slice(0, 2),
      slugs: new Map([[1546640, '要る']])
    })
    const more = await getWordExamples(1546640, 25, 'build-1')
    expect(examples).toHaveBeenCalledWith(1546640, 25, 25)
    expect(more).toHaveLength(2)
    expect(more?.[0].tokens.find(token => token.isPageWord)?.path).toBe('/dictionary/要る-1546640/')
    examples.mockResolvedValue(null)
    expect(await getWordExamples(1, 25, 'build-1')).toBeNull()
  })

  test("a page from another build doesn't load this build's examples", async () => {
    env.DICTIONARY_DB = fakeD1({ tables: true, imported: true })
    expect(await getWordExamples(1546640, 25, 'build-0')).toBeNull()
    expect(await getWordExamples(1546640, 25, 'fixtures')).toBeNull()
    expect(examples).not.toHaveBeenCalled()
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

  test('a word with a conjugation table has its page, and each form its own', async () => {
    // 要る (godan) conjugates; 要 (a noun) doesn't, so its page links no table and has none.
    expect((await getWordPage(1546640))?.conjugationsPath).toBe(
      '/dictionary/要る-1546640/conjugations/'
    )
    expect((await getWordPage(1609600))?.conjugationsPath).toBeNull()
    expect(await getConjugationsPage(1609600)).toBeNull()
    expect(await getConjugationsPage(1358280)).toBeNull()
    const table = await getConjugationsPage(1546640)
    expect(table?.conjugationsPath).toBe('/dictionary/要る-1546640/conjugations/')
    expect(table?.conjugations.rows.Plain.map(row => row.surface).slice(0, 2)).toEqual([
      '要る',
      '要った'
    ])
    const past = await getConjugatedFormPage(1546640, 'Polite', 'past')
    expect(past).toMatchObject({
      mode: 'Polite',
      row: { surface: '要りました' },
      formPath: '/dictionary/要る-1546640/conjugations/polite/past/',
      canonicalPath: '/dictionary/要る-1546640/conjugations/polite/past/'
    })
    // A register or kind the table lacks has no page.
    expect(await getConjugatedFormPage(1546640, 'Plain', 'standalone')).toBeNull()
    expect(await getConjugatedFormPage(1609600, 'Plain', 'past')).toBeNull()
  })

  test('a Polite form spelled as its Plain form names the Plain page as canonical', async () => {
    const te = await getConjugatedFormPage(1546640, 'Polite', 'te-form')
    expect(te?.row.surface).toBe('要って')
    expect(te?.formPath).toBe('/dictionary/要る-1546640/conjugations/polite/te-form/')
    expect(te?.canonicalPath).toBe('/dictionary/要る-1546640/conjugations/plain/te-form/')
  })

  test('a form page shows its first 25 examples, and the rest load 25 at a time', async () => {
    // 入る's fixture keeps 50 examples: two pages' worth.
    const form = await getConjugatedFormPage(1465580, 'Plain', 'present-future')
    expect(form?.examples).toHaveLength(25)
    expect(form?.listed).toBe(50)
    expect(form?.examples[0].tokens.some(token => token.isPageWord)).toBe(true)
    expect(form?.examplesPath).toBe(
      `/dictionary/examples/forms/${encodeURIComponent('入る')}.json?build=fixtures`
    )
    const more = await getFormExamples('入る', 25, 'fixtures')
    expect(more?.map(example => example.position)).toEqual(
      Array.from({ length: 25 }, (_, index) => 25 + index)
    )
    expect(await getFormExamples('入る', 25, 'build-0')).toBeNull()
    // A form without examples lists none.
    expect((await getConjugatedFormPage(1546640, 'Plain', 'imperative'))?.listed).toBe(0)
  })

  test('conjugation pages read the dictionary database', async () => {
    env.DICTIONARY_DB = fakeD1({ tables: true, imported: true })
    if (!iruRows) throw new Error('no fixture for 要る')
    conjugationWord.mockResolvedValue({
      rows: { ...iruRows, examples: [], exampleCount: null },
      slug: '要る'
    })
    formExamples.mockResolvedValue({ rows: [], listed: 0, slugs: new Map() })
    const form = await getConjugatedFormPage(1546640, 'Plain', 'past')
    expect(conjugationWord).toHaveBeenCalledWith(1546640)
    expect(formExamples).toHaveBeenCalledWith('要った', 0, 25)
    expect(form?.examplesPath).toBe(
      `/dictionary/examples/forms/${encodeURIComponent('要った')}.json?build=build-1`
    )
    conjugationWord.mockResolvedValue(null)
    expect(await getConjugationsPage(1)).toBeNull()
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
      env.DICTIONARY_DB = fakeD1({ tables: true, imported: true })
      env.SEARCH_DB = db
      await expect(searchDictionary('いる')).rejects.toThrow('SEARCH_DB is bound but holds no')
    })

    test('a missing binding fails the request instead of showing fixtures', async () => {
      await expect(getWordPage(1546640)).rejects.toThrow("DICTIONARY_DB isn't bound")
      await expect(getKanjiPage('要')).rejects.toThrow("DICTIONARY_DB isn't bound")
      env.DICTIONARY_DB = fakeD1({ tables: true, imported: true })
      await expect(searchDictionary('いる')).rejects.toThrow("SEARCH_DB isn't bound")
    })

    test.each([
      'staging',
      'production'
    ])('%s serves the dictionary from its databases', async site => {
      vi.stubEnv('SITE_ENV', site)
      env.DICTIONARY_DB = fakeD1({ tables: true, imported: true })
      word.mockResolvedValue(null)
      expect(await getWordPage(1546640)).toBeNull()
      expect(word).toHaveBeenCalledWith(1546640)
    })
  })

  test('a failing dictionary database fails the request', async () => {
    env.DICTIONARY_DB = failingD1()
    await expect(getWordPage(1546640)).rejects.toThrow('Network connection lost')
    await expect(getKanjiPage('要')).rejects.toThrow('Network connection lost')
  })

  test('search links every word and the kanji row once the dictionary database is loaded', async () => {
    env.DICTIONARY_DB = fakeD1({ tables: true, imported: true })
    env.SEARCH_DB = fakeD1({ tables: true, imported: true })
    const search = vi.fn(async () => results([eat.entry]))
    vi.mocked(websiteSearch).mockReturnValue({ search })
    kanjiCard.mockResolvedValue({ character: '食', meanings: ['eat', 'food'] })
    const data = await searchDictionary('食')
    expect(kanjiCard).toHaveBeenCalledWith('食')
    // The row shows the primary entry's meaning, as the app's KanjiPrimaryRow does.
    expect(data).toMatchObject({
      kanji: { character: '食', label: 'KANJI', summary: 'to eat', path: '/dictionary/kanji/食/' }
    })
    expect(rowsOf(data).map(result => result.path)).toEqual(['/dictionary/食べる-1358280/'])
    // Only a one-kanji query has a kanji row.
    await searchDictionary('食べる')
    expect(kanjiCard).toHaveBeenCalledTimes(1)
  })

  test("a kanji without a page shows its row without a link, as the app's does", async () => {
    env.DICTIONARY_DB = fakeD1({ tables: true, imported: true })
    env.SEARCH_DB = fakeD1({ tables: true, imported: true })
    vi.mocked(websiteSearch).mockReturnValue({ search: async () => results([]) })
    kanjiCard.mockResolvedValue(null)
    expect(await searchDictionary('㐂')).toMatchObject({
      kanji: { character: '㐂', summary: 'Kanji detail', path: null },
      rows: []
    })
  })
})
