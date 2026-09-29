import { getCloudflareContext } from '@opennextjs/cloudflare'
import { cache } from 'react'
import {
  fixtureElementRows,
  fixtureFormExamples,
  fixtureKanjiRows,
  fixtureSearchOrder,
  fixtureWordRows
} from '@/lib/dictionary/fixtures'
import { isDeployedSite } from '@/lib/site'
import {
  type ConjugationMode,
  type ConjugationRow,
  type Conjugations,
  canonicalForm
} from './detail/conjugation'
import {
  kanjiElementDetail,
  type LinkedKanjiElementDetail,
  linkKanjiElement
} from './detail/element'
import { examplesPerPage, formExample, wordExample } from './detail/examples'
import {
  type KanjiDetail,
  type KanjiElement,
  type KanjiReading,
  type KanjiWord,
  kanjiDetail
} from './detail/kanji'
import type { PitchAccent } from './detail/pitch'
import type {
  FrequencyRow,
  KanjiElementRows,
  KanjiRows,
  WordExampleRows,
  WordRows
} from './detail/rows'
import type { RubySegment } from './detail/ruby'
import {
  type AlternativeForm,
  type RelatedWord,
  type WordDetail,
  type WordKanji,
  wordDetail
} from './detail/word'
import { dictionaryDatabase } from './dictionary-db'
import {
  resultsExampleCount,
  type SearchExampleList,
  searchExampleList,
  searchExamplePage,
  type WebsiteExampleSearch,
  websiteExampleSearch
} from './example-search'
import {
  databaseLinks,
  type Linked,
  type Links,
  type PageExample,
  pageExample,
  storedWordPath
} from './page-example'
import {
  linkedWords,
  linkSearchScreen,
  resultsPerPage,
  type SearchData,
  type SearchWord
} from './results/links'
import {
  isSingleKanji,
  loadFrequency,
  type SearchResultsScreen,
  searchResultsScreen
} from './results/results'
import { isASCII, normalizeQuery } from './search/query'
import { d1SearchDatabase, type SearchResults } from './search/search'
import { websiteSearch } from './search/website'
import {
  conjugatedFormPath,
  conjugationsPath,
  kanjiPath,
  searchPath,
  wordPath,
  wordSlug
} from './urls'

type DictionaryDatabase = ReturnType<typeof dictionaryDatabase>

// Pages read the dictionary only through this module. It runs the detail core (./detail) over
// rows and adds only the site's URLs. Word and kanji rows come from the dictionary database
// (DICTIONARY_DB), and search from the search database (SEARCH_DB), each when it holds a finished
// import. Only local development falls back to fixtures (as in `pnpm dev` by default); staging and
// production, which serve the dictionary, never do (`imported`). Only the row lookups here differ
// between the two.

export interface WordPageData
  extends Omit<WordDetail, 'alternatives' | 'kanji' | 'alternativeKanji' | 'related' | 'examples'> {
  /** Where the word's page lives now; a request under another slug redirects here. */
  slug: string
  path: string
  alternatives: Linked<AlternativeForm>[]
  kanji: Linked<WordKanji>[]
  alternativeKanji: Linked<WordKanji>[]
  related: Linked<RelatedWord>[]
  /** The first examples; the rest load from `examplesPath` as the page scrolls. */
  examples: PageExample[]
  examplesPath: string
  /** The conjugation table's page, which the part of speech opens; null when it opens none. */
  conjugationsPath: string | null
}

/** A word as its conjugation screens show it: the headline, meaning, and word class. */
export interface ConjugationWordData {
  entSeq: number
  /** The slug the word's pages live under (`words.slug`); another redirects. */
  slug: string
  headword: string
  reading: string
  summary: string
  partOfSpeech: string
  ruby: RubySegment[]
  pitch: PitchAccent | null
  /** The word's page, and its conjugation table's. */
  path: string
  conjugationsPath: string
}

/** The conjugation table's page (ConjugationsView). */
export interface ConjugationsPageData extends ConjugationWordData {
  conjugations: Conjugations
}

/** A conjugated form's page (ConjugatedFormView). */
export interface ConjugatedFormPageData extends ConjugationWordData {
  mode: ConjugationMode
  row: ConjugationRow
  /** Where the form's page lives, and the page search engines should index for it. */
  formPath: string
  canonicalPath: string
  /** The first examples; the rest load from `examplesPath` as the page scrolls. */
  examples: PageExample[]
  /** How many examples the form lists, at most 100. */
  listed: number
  examplesPath: string
}

export interface KanjiPageData
  extends Omit<KanjiDetail, 'readings' | 'components' | 'elements' | 'words'> {
  readings: (Omit<KanjiReading, 'words'> & { words: Linked<KanjiWord>[] })[]
  components: Linked<{ character: string }>[]
  elements: KanjiElement[]
  words: Linked<KanjiWord>[]
  /** A kanji with no meanings or readings stays out of search engines (#465). */
  indexable: boolean
}

export type { PageExample, PageExampleToken } from './page-example'

/** An element page: each kanji links to its kanji page, when it has one. */
export type KanjiElementPageData = LinkedKanjiElementDetail

export type { SearchData, SearchWord } from './results/links'

const wordRowsBySeq = new Map(fixtureWordRows.map(rows => [rows.entry.entSeq, rows]))
const kanjiRowsByCharacter = new Map(fixtureKanjiRows.map(rows => [rows.kanji.character, rows]))
const elementRowsByGlyph = new Map(fixtureElementRows.map(rows => [rows.element.glyph, rows]))

/** The fixtures' links: only fixture words and kanji have pages. */
const fixtureLinks: Links = {
  word(entSeq) {
    const rows = entSeq === null ? undefined : wordRowsBySeq.get(entSeq)
    return rows ? wordPath(rows.entry) : null
  },
  kanji(character) {
    return character !== null && kanjiRowsByCharacter.has(character) ? kanjiPath(character) : null
  }
}

/**
 * The dictionary database, when it holds a finished import, with the build it holds; null when
 * local development reads fixtures.
 */
export async function loadedDictionary() {
  const db = await dictionaryDb()
  return db ? { db, build: await dictionaryBuild() } : null
}

/** The dictionary database, when it holds a finished import. */
async function dictionaryDb() {
  const { env } = await getCloudflareContext({ async: true })
  const db = await imported(env.DICTIONARY_DB, 'DICTIONARY_DB')
  return db ? dictionaryDatabase(db) : null
}

/** The build the page's rows come from: the dictionary database's, or the fixtures'. */
async function dictionaryBuild(): Promise<string> {
  const { env } = await getCloudflareContext({ async: true })
  const db = await imported(env.DICTIONARY_DB, 'DICTIONARY_DB')
  return db ? (importedBuilds.get(db) ?? '') : fixtureBuild
}

const fixtureBuild = 'fixtures'

/**
 * Where the page loads more of a word's examples (src/app/dictionary/examples), for the build the
 * page came from, so a page never mixes its first examples with another build's next ones.
 */
export const examplesPath = (entSeq: number, build: string) =>
  `/dictionary/examples/${entSeq}.json?build=${encodeURIComponent(build)}`

/** Where a conjugated form's page loads more of its examples, by the form's spelling. */
export const formExamplesPath = (surface: string, build: string) =>
  `/dictionary/examples/forms/${encodeURIComponent(surface)}.json?build=${encodeURIComponent(build)}`

function wordPage(rows: WordRows, slug: string, links: Links, build: string): WordPageData {
  const detail = wordDetail(rows)
  const linkKanji = (kanji: WordKanji) => ({ ...kanji, path: links.kanji(kanji.character) })
  return {
    ...detail,
    slug,
    path: storedWordPath(slug, detail.entSeq),
    alternatives: detail.alternatives.map(form => ({ ...form, path: links.kanji(form.kanji) })),
    kanji: detail.kanji.map(linkKanji),
    alternativeKanji: detail.alternativeKanji.map(linkKanji),
    related: detail.related.map(word => ({ ...word, path: links.word(word.entSeq) })),
    examples: detail.examples.map(example => pageExample(example, links)),
    examplesPath: examplesPath(detail.entSeq, build),
    conjugationsPath: detail.conjugations
      ? conjugationsPath(storedWordPath(slug, detail.entSeq))
      : null
  }
}

function kanjiPage(rows: KanjiRows, indexable: boolean, links: Links): KanjiPageData {
  const detail = kanjiDetail(rows)
  const linkWord = (word: KanjiWord) => ({ ...word, path: links.word(word.entSeq) })
  return {
    ...detail,
    readings: detail.readings.map(reading => ({ ...reading, words: reading.words.map(linkWord) })),
    components: detail.components.map(component => ({
      character: component,
      path: links.kanji(component)
    })),
    words: detail.words.map(linkWord),
    indexable
  }
}

/**
 * A failing dictionary database throws, so the request fails rather than rendering a 404.
 * Memoized per request, so the page and its metadata read the database once.
 */
export const getWordPage = cache(async (entSeq: number): Promise<WordPageData | null> => {
  const db = await dictionaryDb()
  if (db) {
    const word = await db.word(entSeq)
    if (!word) return null
    const slugs = new Map([...word.relatedSlugs, ...word.exampleSlugs])
    return wordPage(
      word.rows,
      word.slug,
      databaseLinks(slugs, word.kanjiPages),
      await dictionaryBuild()
    )
  }
  const rows = wordRowsBySeq.get(entSeq)
  if (!rows) return null
  return wordPage(
    { ...rows, examples: rows.examples.slice(0, examplesPerPage) },
    wordSlug(rows.entry.headword, rows.entry.reading),
    fixtureLinks,
    fixtureBuild
  )
})

/**
 * `examplesPerPage` of a word's examples from position `from`, as its page loads more; null for
 * an unknown word, or when `build` isn't the build now loaded (the page is from an earlier
 * deploy). A failing database throws.
 */
export async function getWordExamples(
  entSeq: number,
  from: number,
  build: string
): Promise<PageExample[] | null> {
  if (build !== (await dictionaryBuild())) return null
  const db = await dictionaryDb()
  if (db) {
    const found = await db.examples(entSeq, from, examplesPerPage)
    if (!found) return null
    const links = databaseLinks(found.slugs, new Set())
    return found.rows.map(row => pageExample(wordExample(row), links))
  }
  const rows = wordRowsBySeq.get(entSeq)
  if (!rows) return null
  return rows.examples
    .slice(from, from + examplesPerPage)
    .map((row: WordExampleRows) => pageExample(wordExample(row), fixtureLinks))
}

/** A word's conjugation screens' rows, without examples, and its slug; null for an unknown word. */
async function conjugationWord(
  entSeq: number,
  db: DictionaryDatabase | null
): Promise<{ rows: WordRows; slug: string } | null> {
  if (db) return db.conjugationWord(entSeq)
  const rows = wordRowsBySeq.get(entSeq)
  if (!rows) return null
  return {
    rows: { ...rows, examples: [], exampleCount: null },
    slug: wordSlug(rows.entry.headword, rows.entry.reading)
  }
}

/**
 * The conjugation table's page (ConjugationsView), which the part of speech opens; null for an
 * unknown word or one whose part of speech opens none. Memoized per request, like getWordPage.
 */
export const getConjugationsPage = cache(
  async (entSeq: number): Promise<ConjugationsPageData | null> => {
    const word = await conjugationWord(entSeq, await dictionaryDb())
    if (!word) return null
    const detail = wordDetail(word.rows)
    if (!detail.conjugations) return null
    const path = storedWordPath(word.slug, detail.entSeq)
    return {
      entSeq: detail.entSeq,
      slug: word.slug,
      headword: detail.headword,
      reading: detail.reading,
      summary: detail.summary,
      partOfSpeech: detail.partOfSpeech,
      ruby: detail.ruby,
      pitch: detail.pitch,
      path,
      conjugationsPath: conjugationsPath(path),
      conjugations: detail.conjugations
    }
  }
)

/**
 * A conjugated form's page (ConjugatedFormView) and its first examples; null for an unknown
 * word, a word without a table, or a register or kind its table lacks. Memoized per request.
 */
export const getConjugatedFormPage = cache(
  async (
    entSeq: number,
    mode: ConjugationMode,
    kind: string
  ): Promise<ConjugatedFormPageData | null> => {
    const page = await getConjugationsPage(entSeq)
    if (!page?.conjugations.modes.includes(mode)) return null
    const row = page.conjugations.rows[mode].find(form => form.kind === kind)
    if (!row) return null
    const { conjugations, ...word } = page
    const canonical = canonicalForm(
      {
        plain: conjugations.rows.Plain,
        polite: conjugations.modes.includes('Polite') ? conjugations.rows.Polite : []
      },
      mode,
      row
    )
    const found = await formExamplePage(row.surface, 0)
    return {
      ...word,
      mode,
      row,
      formPath: conjugatedFormPath(page.path, mode, row.kind),
      canonicalPath: conjugatedFormPath(page.path, canonical.mode, canonical.kind),
      examples: found.examples,
      listed: found.listed,
      examplesPath: formExamplesPath(row.surface, await dictionaryBuild())
    }
  }
)

/** `examplesPerPage` of a form's examples from `from`, linked, with how many it lists. */
async function formExamplePage(
  surface: string,
  from: number
): Promise<{ examples: PageExample[]; listed: number }> {
  const db = await dictionaryDb()
  if (db) {
    const found = await db.formExamples(surface, from, examplesPerPage)
    const links = databaseLinks(found.slugs, new Set())
    return {
      examples: found.rows.map(row => pageExample(formExample(row), links)),
      listed: found.listed
    }
  }
  const rows = fixtureFormExamples.get(surface) ?? []
  return {
    examples: rows
      .slice(from, from + examplesPerPage)
      .map(row => pageExample(formExample(row), fixtureLinks)),
    listed: rows.length
  }
}

/**
 * `examplesPerPage` of a conjugated form's examples from position `from`, by the form's spelling,
 * as its page loads more; null when `build` isn't the build now loaded. A failing database throws.
 */
export async function getFormExamples(
  surface: string,
  from: number,
  build: string
): Promise<PageExample[] | null> {
  if (build !== (await dictionaryBuild())) return null
  return (await formExamplePage(surface, from)).examples
}

/** Memoized per request, like getWordPage. */
export const getKanjiPage = cache(async (character: string): Promise<KanjiPageData | null> => {
  const db = await dictionaryDb()
  if (db) {
    const kanji = await db.kanji(character)
    if (!kanji) return null
    return kanjiPage(kanji.rows, kanji.indexable, databaseLinks(kanji.wordSlugs, kanji.kanjiPages))
  }
  const rows = kanjiRowsByCharacter.get(character)
  if (!rows) return null
  const { meanings, readings } = rows.kanji
  return kanjiPage(rows, meanings.length > 0 || readings.length > 0, fixtureLinks)
})

const kanjiElementPage = (rows: KanjiElementRows, links: Links): KanjiElementPageData =>
  linkKanjiElement(kanjiElementDetail(rows), character => links.kanji(character))

/** An element's page, by its exact glyph; null for one that isn't an element. Memoized per request. */
export const getKanjiElementPage = cache(
  async (glyph: string): Promise<KanjiElementPageData | null> => {
    const db = await dictionaryDb()
    if (db) {
      const element = await db.element(glyph)
      if (!element) return null
      return kanjiElementPage(element.rows, databaseLinks(new Map(), element.kanjiPages))
    }
    const rows = elementRowsByGlyph.get(glyph)
    return rows ? kanjiElementPage(rows, fixtureLinks) : null
  }
)

// Release databases known to hold an import, with the build each holds. Only a finished import is
// remembered, so a database that has none yet is checked again on the next request.
const importedBuilds = new WeakMap<D1Database, string>()

/**
 * Whether a release database (SEARCH_DB or DICTIONARY_DB) holds a complete import; the import
 * writes `dictionary_import` last. A local one has no tables until
 * `scripts/release-d1/load-local.sh` loads one.
 */
async function holdsImport(db: D1Database): Promise<boolean> {
  if (importedBuilds.has(db)) return true
  const table = await db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'dictionary_import'")
    .first()
  if (!table) return false
  const row = await db
    .prepare('SELECT build_id FROM dictionary_import')
    .first<{ build_id: string }>()
  if (!row) return false
  importedBuilds.set(db, row.build_id)
  return true
}

/**
 * A bound release database, when it holds a finished import; null for fixtures. Only local
 * development (no SITE_ENV) falls back to fixtures: staging and production serve the dictionary,
 * so a missing binding, or one bound to a database without an import, fails the request instead
 * of showing fixtures, and can't pass as working.
 */
async function imported(db: D1Database | undefined, binding: string) {
  if (!db) {
    if (isDeployedSite()) throw new Error(`${binding} isn't bound`)
    return null
  }
  if (await holdsImport(db)) return db
  if (isDeployedSite()) throw new Error(`${binding} is bound but holds no finished import`)
  return null
}

/**
 * Whether a search failed because SQLite's full-text search couldn't read the query, such as an
 * English query with a NUL or an unbalanced quote. The core throws nothing itself; these are
 * FTS5's errors, passed on by D1. Any other failure is the database's.
 */
export function isUnreadableQuery(error: unknown): boolean {
  // FTS5's own parser errors only (checked against SQLite): a bare "syntax error" would also hide
  // a real SQL bug in the core as "no results".
  const unreadable = /fts5: syntax error|unterminated string|malformed MATCH/i
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    if (unreadable.test(cause.message)) return true
  }
  return false
}

/** Results as the search core returns them, for `searchResultsScreen`. */
function searchResults(items: SearchResults['items']): SearchResults {
  return {
    items,
    leadingLexicalEntryCount: items.length,
    presentation: 'ranked',
    resolution: 'direct',
    readingRefinement: null,
    usesPrimaryEntryExamples: false,
    hasExactOrPrefixMatch: items.length > 0
  }
}

/**
 * The fixtures' results, in the order the app lists them (`fixtureSearchOrder`), with their
 * frequency. Each is its own match group, so the re-sort keeps that order.
 */
function fixtureResults(query: string) {
  const ordered = Object.hasOwn(fixtureSearchOrder, query) ? fixtureSearchOrder[query] : undefined
  const matches: WordRows[] = ordered
    ? ordered.flatMap(entSeq => wordRowsBySeq.get(entSeq) ?? [])
    : fixtureWordRows.filter(
        ({ entry }) =>
          entry.headword === query ||
          entry.reading === query ||
          entry.summary.toLowerCase().split(/[,;] /).includes(query)
      )
  const results = searchResults(
    matches.map(({ entry }, position) => ({
      entry: { ...entry, sourceRecordId: entry.entSeq },
      sourceOrder: position,
      matchRank: {
        kind: 'japanese',
        relation: 0,
        priorityProfile: { primaryMask: 0, secondaryMask: 0, newsFrequencyBand: null },
        senseBreadthRank: 0,
        headwordLength: 0,
        semanticFingerprint: ''
      },
      fallbackOrder: position,
      matchedSummary: null
    }))
  )
  const frequency = new Map<string, FrequencyRow[]>(
    matches.map(rows => [rows.entry.id, rows.frequency])
  )
  return { results, frequency }
}

/** The search database, when it holds a finished import; null when local development reads fixtures. */
async function searchDb(): Promise<D1Database | null> {
  const { env } = await getCloudflareContext({ async: true })
  // A failing database throws, so the request fails rather than rendering an empty page.
  return imported(env.SEARCH_DB, 'SEARCH_DB')
}

/** The build a search page's rows come from: the search database's, or the fixtures'. */
async function searchBuild(): Promise<string> {
  const db = await searchDb()
  return db ? (importedBuilds.get(db) ?? '') : fixtureBuild
}

/** The search core's results for the query; a query full-text search can't read finds nothing. */
async function searchResultsFor(db: D1Database, query: string): Promise<SearchResults | null> {
  try {
    return await websiteSearch(db).search(query)
  } catch (error) {
    // Like the app, a query full-text search can't read shows no results.
    if (isUnreadableQuery(error)) return null
    throw error
  }
}

/**
 * The search core's results for the query, their frequency evidence, and the Example Sentences
 * row's count, all from the search database, so its import gate (results/conformance.test.ts)
 * checks everything the page orders and shows; the fixtures without one, which have no example
 * sentences.
 */
async function searchScreen(
  query: string,
  options: { examples: boolean } = { examples: true }
): Promise<SearchResultsScreen> {
  const db = await searchDb()
  if (!db) {
    const { results, frequency } = fixtureResults(query)
    return searchResultsScreen(query, results, frequency)
  }
  return (await searchOn(db, query, options)).screen
}

/**
 * A query's search on a search database, and the results screen it makes: the search, its
 * frequency evidence, and, unless `examples` is false, the Example Sentences row's count. A query
 * full-text search can't read finds nothing. The page and the search import's gate and
 * rendered-page tests all read it through here.
 */
export async function searchOn(
  db: D1Database,
  query: string,
  { examples }: { examples: boolean } = { examples: true }
): Promise<{ results: SearchResults; screen: SearchResultsScreen }> {
  const results = await searchResultsFor(db, query)
  if (!results) {
    const none = searchResults([])
    return { results: none, screen: searchResultsScreen(query, none, new Map()) }
  }
  // One query for every result, as the app loads frequency after the results.
  const [frequency, count] = await Promise.all([
    loadFrequency(d1SearchDatabase(db), results),
    examples ? resultsExampleCount(websiteExampleSearch(db), results, query) : 0
  ])
  return { results, screen: searchResultsScreen(query, results, frequency, count) }
}

/** Whether a searched kanji has a page: in the dictionary database, or a fixture kanji. */
async function hasKanjiPage(character: string, db: DictionaryDatabase | null): Promise<boolean> {
  return db ? (await db.kanjiCard(character)) !== null : kanjiRowsByCharacter.has(character)
}

/**
 * The search results screen with its links, and its first `resultsPerPage` words. Every word
 * links once the dictionary database is loaded; before that, only fixture words have pages.
 * Memoized per request, so the page and its metadata search once.
 */
export const searchDictionary = cache(async (query: string): Promise<SearchData> => {
  const dictionary = dictionaryDb()
  const [db, screen, kanjiHasPage, build] = await Promise.all([
    dictionary,
    searchScreen(query),
    isSingleKanji(query) ? dictionary.then(db => hasKanjiPage(query, db)) : false,
    searchBuild()
  ])
  return linkSearchScreen(screen, { dictionaryLoaded: db !== null, kanjiHasPage, build })
})

/**
 * `resultsPerPage` of a search's words from position `from`, as its page loads more; null when
 * `build` isn't the search build now loaded (the page is from an earlier deploy).
 */
export async function getSearchRows(
  query: string,
  from: number,
  build: string
): Promise<SearchWord[] | null> {
  if (build !== (await searchBuild())) return null
  // The rows don't depend on example sentences, so the route doesn't count them.
  const [screen, db] = await Promise.all([searchScreen(query, { examples: false }), dictionaryDb()])
  return linkedWords(screen, db !== null).slice(from, from + resultsPerPage)
}

/** A search's Example Sentences page (ExampleSentencesView.swift). */
export interface SearchExamplesData {
  query: string
  /** How many examples it lists, at most the app's 100. */
  listed: number
  /** Whether search engines may index it (`searchExamplesIndexable`). */
  indexable: boolean
  /** The first examples; the rest load from `examplesPath` as the page scrolls. */
  examples: PageExample[]
  examplesPath: string
}

/** Where a search's Example Sentences page loads more, for the search build it came from. */
export const searchExamplesJsonPath = (query: string, build: string) =>
  `${searchPath(query)}examples.json?build=${encodeURIComponent(build)}`

/** A search's Example Sentences: the list, and what reads its sentences. */
export interface SearchExamplesOn {
  search: WebsiteExampleSearch
  list: SearchExampleList
  /** Whether it lists the primary entry's examples, for a deinflected or romaji search. */
  usesPrimaryEntryExamples: boolean
}

/**
 * A search's Example Sentences from a search database; null for a query full-text search can't
 * read. The page and the search import's gate and rendered-page test all read it through here.
 */
export async function searchExamplesOn(
  db: D1Database,
  query: string
): Promise<SearchExamplesOn | null> {
  const results = await searchResultsFor(db, query)
  if (!results) return null
  const search = websiteExampleSearch(db)
  return {
    search,
    list: await searchExampleList(search, results, query),
    usesPrimaryEntryExamples: results.usesPrimaryEntryExamples
  }
}

/**
 * `examplesPerPage` of a search's examples from position `from`, as the page shows them, linking
 * words to the pages `links` gives for their entries.
 */
export async function searchExamplePageOn(
  found: SearchExamplesOn,
  query: string,
  from: number,
  links: (entSeqs: number[]) => Promise<Links>
): Promise<PageExample[]> {
  const rows = await searchExamplePage(found.search, found.list, query, from, examplesPerPage)
  const entSeqs = rows.flatMap(({ example }) =>
    example.links.flatMap(link => (link.entSeqs.length === 1 ? link.entSeqs : []))
  )
  const linked = await links(entSeqs)
  return rows.map(row => pageExample(wordExample(row), linked))
}

/** Word pages from the dictionary database, or the fixtures'. */
async function exampleWordLinks(entSeqs: number[]): Promise<Links> {
  const dictionary = await dictionaryDb()
  return dictionary ? databaseLinks(await dictionary.wordSlugs(entSeqs), new Set()) : fixtureLinks
}

/**
 * A search's Example Sentences page: the primary entry's examples for a deinflected or romaji
 * search, otherwise the sentences that contain the query, each word linked as the app links it
 * there; null without any, which the app never opens, so the page answers 404. Local fixtures
 * have none. Memoized per request.
 */
export const getSearchExamples = cache(
  async (query: string): Promise<SearchExamplesData | null> => {
    const db = await searchDb()
    if (!db) return null
    const found = await searchExamplesOn(db, query)
    if (!found || found.list.ids.length === 0) return null
    return {
      query,
      listed: found.list.ids.length,
      indexable: searchExamplesIndexable(query, found.usesPrimaryEntryExamples),
      examples: await searchExamplePageOn(found, query, 0, exampleWordLinks),
      examplesPath: searchExamplesJsonPath(query, await searchBuild())
    }
  }
)

/**
 * Whether search engines may index a search's Example Sentences page: only a direct Japanese
 * search's, by the owner's decision on #511. A romaji or deinflected search lists its primary
 * entry's examples, which that entry's word page already has.
 */
export const searchExamplesIndexable = (query: string, usesPrimaryEntryExamples: boolean) =>
  !isASCII(normalizeQuery(query)) && !usesPrimaryEntryExamples

/**
 * `examplesPerPage` of a search's examples from position `from`, as its page loads more; null
 * when `build` isn't the search build now loaded. A failing database throws.
 */
export async function getMoreSearchExamples(
  query: string,
  from: number,
  build: string
): Promise<PageExample[] | null> {
  if (build !== (await searchBuild())) return null
  const db = await searchDb()
  if (!db) return []
  const found = await searchExamplesOn(db, query)
  if (!found) return []
  return searchExamplePageOn(found, query, from, exampleWordLinks)
}
