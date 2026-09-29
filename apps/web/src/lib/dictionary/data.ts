import { getCloudflareContext } from '@opennextjs/cloudflare'
import { cache } from 'react'
import { fixtureKanjiRows, fixtureSearchOrder, fixtureWordRows } from '@/lib/dictionary/fixtures'
import { isDeployedSite, isProductionSite } from '@/lib/site'
import { type Example, type ExampleToken, examplesPerPage, wordExample } from './detail/examples'
import {
  type KanjiDetail,
  type KanjiElement,
  type KanjiReading,
  type KanjiWord,
  kanjiDetail
} from './detail/kanji'
import type { FrequencyRow, KanjiRows, WordExampleRows, WordRows } from './detail/rows'
import {
  type AlternativeForm,
  type RelatedWord,
  type WordDetail,
  type WordKanji,
  type WordSummary,
  wordDetail,
  wordSummary
} from './detail/word'
import { dictionaryDatabase } from './dictionary-db'
import type { SearchEntry } from './search/search'
import { websiteSearch } from './search/website'
import { hasSearchPath, kanjiPath, searchPath, wordPath, wordSlug } from './urls'

type DictionaryDatabase = ReturnType<typeof dictionaryDatabase>

// Pages read the dictionary only through this module. It runs the detail core (./detail) over
// rows and adds only the site's URLs. Word and kanji rows come from the dictionary database
// (DICTIONARY_DB), and search from the search database (SEARCH_DB), each when it holds a finished
// import; otherwise, as in `pnpm dev` by default, from local fixtures. Only the row lookups here
// differ between the two.

/** Production shows no dictionary pages until real data is loaded, so fixtures are never indexed. */
export function isDictionaryAvailable(): boolean {
  return !isProductionSite()
}

/** With the page it links to; null when it has no page yet. */
type Linked<T> = T & { path: string | null }

/** An example's word with where it links: its word page, or a search for an ambiguous word. */
export type PageExampleToken = Linked<ExampleToken>

export interface PageExample extends Omit<Example, 'tokens'> {
  tokens: PageExampleToken[]
}

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
}

export interface KanjiPageData
  extends Omit<KanjiDetail, 'readings' | 'components' | 'elements' | 'words'> {
  readings: (Omit<KanjiReading, 'words'> & { words: Linked<KanjiWord>[] })[]
  components: Linked<{ character: string }>[]
  elements: Linked<KanjiElement>[]
  words: Linked<KanjiWord>[]
  /** A kanji with no meanings or readings stays out of search engines (#465). */
  indexable: boolean
}

/** A search result; `path` is null when the word has no page yet (#465). */
export type SearchWord = Linked<WordSummary>

export interface SearchData {
  query: string
  kanji: { character: string; meanings: string[]; path: string } | null
  words: SearchWord[]
}

const wordRowsBySeq = new Map(fixtureWordRows.map(rows => [rows.entry.entSeq, rows]))
const kanjiRowsByCharacter = new Map(fixtureKanjiRows.map(rows => [rows.kanji.character, rows]))

/** Where a page's links go: a path, or null for a word or kanji without a page. */
interface Links {
  word(entSeq: number | null): string | null
  kanji(character: string | null): string | null
}

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

/** The path of a word page in the dictionary database, under its stored slug. */
const storedWordPath = (slug: string, entSeq: number) => `/dictionary/${slug}-${entSeq}/`

/** Links from a page read from the dictionary database, where every word has a page. */
function databaseLinks(wordSlugs: Map<number, string>, kanjiPages: Set<string>): Links {
  return {
    word(entSeq) {
      const slug = entSeq === null ? undefined : wordSlugs.get(entSeq)
      return entSeq === null || slug === undefined ? null : storedWordPath(slug, entSeq)
    },
    kanji(character) {
      return character !== null && kanjiPages.has(character) ? kanjiPath(character) : null
    }
  }
}

/**
 * The dictionary database, when the site shows the dictionary and the database holds a finished
 * import, with the build it holds; null otherwise (production before launch, or fixtures).
 */
export async function loadedDictionary() {
  if (!isDictionaryAvailable()) return null
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

/** An example with its links: a word to its page, an ambiguous word to a search for it. */
function pageExample(example: Example, links: Links): PageExample {
  return {
    ...example,
    tokens: example.tokens.map(token => ({
      ...token,
      path: !token.link
        ? null
        : 'entSeq' in token.link
          ? links.word(token.link.entSeq)
          : hasSearchPath(token.link.query)
            ? searchPath(token.link.query)
            : null
    }))
  }
}

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
    examplesPath: examplesPath(detail.entSeq, build)
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
    elements: detail.elements.map(element => ({
      ...element,
      path: links.kanji(element.character)
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

/**
 * A search result as a word. Every word links once the dictionary database is loaded (`linked`);
 * before that, only fixture words have pages. `frequency` comes from the dictionary database too,
 * since the search database has none, and becomes the chips SearchView.swift shows on each row.
 */
export function summarizeSearchEntry(
  entry: SearchEntry,
  linked = false,
  frequency: readonly FrequencyRow[] = []
): SearchWord {
  const entSeq = entry.sourceRecordId
  const word = wordSummary({ ...entry, entSeq }, frequency)
  return { ...word, path: linked ? wordPath(word) : fixtureLinks.word(entSeq) }
}

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
 * development (no SITE_ENV) falls back to fixtures from a bound database without one: staging and
 * production fail the request instead, so a database bound by mistake can't pass as working.
 */
async function imported(db: D1Database | undefined, binding: string) {
  if (!db) return null
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

function fixtureWords(query: string): SearchWord[] {
  const ordered = Object.hasOwn(fixtureSearchOrder, query) ? fixtureSearchOrder[query] : undefined
  const matches: WordRows[] = ordered
    ? ordered.flatMap(entSeq => wordRowsBySeq.get(entSeq) ?? [])
    : fixtureWordRows.filter(
        ({ entry }) =>
          entry.headword === query ||
          entry.reading === query ||
          entry.summary.toLowerCase().split(/[,;] /).includes(query)
      )
  return matches.map(rows => ({
    ...wordSummary(rows.entry, rows.frequency),
    path: wordPath(rows.entry)
  }))
}

async function searchWords(query: string, dictionary: DictionaryDatabase | null) {
  const { env } = await getCloudflareContext({ async: true })
  // A failing database throws, so the request fails rather than rendering an empty page.
  const db = await imported(env.SEARCH_DB, 'SEARCH_DB')
  if (!db) return fixtureWords(query)
  let entries: SearchEntry[]
  try {
    entries = (await websiteSearch(db).search(query)).items.map(item => item.entry)
  } catch (error) {
    // Like the app, a query full-text search can't read shows no results.
    if (isUnreadableQuery(error)) return []
    throw error
  }
  // The frequency chips: one query for every result, on the dictionary database, outside the
  // search core (presentation, which the app also loads after the results).
  const frequency = dictionary
    ? await dictionary.frequency(entries.map(entry => entry.sourceRecordId))
    : new Map<number, FrequencyRow[]>()
  return entries.map(entry =>
    summarizeSearchEntry(entry, !!dictionary, frequency.get(entry.sourceRecordId))
  )
}

/** The kanji card for a search for one kanji. */
async function searchKanji(
  query: string,
  db: DictionaryDatabase | null
): Promise<SearchData['kanji']> {
  const kanji = db
    ? [...query].length === 1
      ? await db.kanjiCard(query)
      : null
    : (kanjiRowsByCharacter.get(query)?.kanji ?? null)
  return kanji
    ? { character: kanji.character, meanings: kanji.meanings, path: kanjiPath(kanji.character) }
    : null
}

/** Memoized per request, so the page and its metadata search once. */
export const searchDictionary = cache(async (query: string): Promise<SearchData> => {
  const db = await dictionaryDb()
  const [kanji, words] = await Promise.all([searchKanji(query, db), searchWords(query, db)])
  return { query, kanji, words }
})
