import { getCloudflareContext } from '@opennextjs/cloudflare'
import { cache } from 'react'
import { fixtureKanjiRows, fixtureSearchOrder, fixtureWordRows } from '@/lib/dictionary/fixtures'
import { isProductionSite } from '@/lib/site'
import {
  type KanjiDetail,
  type KanjiElement,
  type KanjiReading,
  type KanjiWord,
  kanjiDetail
} from './detail/kanji'
import type { WordRows } from './detail/rows'
import {
  type AlternativeForm,
  type RelatedWord,
  type WordDetail,
  type WordKanji,
  type WordSummary,
  wordDetail,
  wordSummary
} from './detail/word'
import type { SearchEntry } from './search/search'
import { websiteSearch } from './search/website'
import { kanjiPath, wordPath, wordSlug } from './urls'

// Pages read the dictionary only through this module. It runs the detail core (./detail) over
// rows and adds only the site's URLs. Search runs on the search database (SEARCH_DB) when it
// holds an import; word and kanji rows come from local fixtures until their data is in D1
// (#465). Only the row lookups here change as it moves.

/** Production shows no dictionary pages until real data is loaded, so fixtures are never indexed. */
export function isDictionaryAvailable(): boolean {
  return !isProductionSite()
}

/** With the page it links to; null when it has no page yet. */
type Linked<T> = T & { path: string | null }

export interface WordPageData
  extends Omit<WordDetail, 'alternatives' | 'kanji' | 'alternativeKanji' | 'related'> {
  /** Where the word's page lives now; a request under another slug redirects here. */
  slug: string
  path: string
  alternatives: Linked<AlternativeForm>[]
  kanji: Linked<WordKanji>[]
  alternativeKanji: Linked<WordKanji>[]
  related: Linked<RelatedWord>[]
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

/** The word's page, when it has one, under the slug of its own headword. */
function wordPagePath(entSeq: number | null): string | null {
  const rows = entSeq === null ? undefined : wordRowsBySeq.get(entSeq)
  return rows ? wordPath(rows.entry) : null
}

/** The kanji's page, when it has one. */
function kanjiPagePath(character: string | null): string | null {
  return character !== null && kanjiRowsByCharacter.has(character) ? kanjiPath(character) : null
}

export async function getWordPage(entSeq: number): Promise<WordPageData | null> {
  const rows = wordRowsBySeq.get(entSeq)
  if (!rows) return null
  const detail = wordDetail(rows)
  const linkKanji = (kanji: WordKanji) => ({ ...kanji, path: kanjiPagePath(kanji.character) })
  return {
    ...detail,
    slug: wordSlug(detail.headword, detail.reading),
    path: wordPath(rows.entry),
    alternatives: detail.alternatives.map(form => ({ ...form, path: kanjiPagePath(form.kanji) })),
    kanji: detail.kanji.map(linkKanji),
    alternativeKanji: detail.alternativeKanji.map(linkKanji),
    related: detail.related.map(word => ({ ...word, path: wordPagePath(word.entSeq) }))
  }
}

export async function getKanjiPage(character: string): Promise<KanjiPageData | null> {
  const rows = kanjiRowsByCharacter.get(character)
  if (!rows) return null
  const detail = kanjiDetail(rows)
  const linkWord = (word: KanjiWord) => ({ ...word, path: wordPagePath(word.entSeq) })
  return {
    ...detail,
    readings: detail.readings.map(reading => ({ ...reading, words: reading.words.map(linkWord) })),
    components: detail.components.map(component => ({
      character: component,
      path: kanjiPagePath(component)
    })),
    elements: detail.elements.map(element => ({
      ...element,
      path: kanjiPagePath(element.character)
    })),
    words: detail.words.map(linkWord),
    indexable: detail.meanings.length > 0 || detail.readings.length > 0
  }
}

/** A search result as a word. The search database has no frequency yet. */
export function summarizeSearchEntry(entry: SearchEntry): SearchWord {
  const entSeq = entry.sourceRecordId
  return { ...wordSummary({ ...entry, entSeq }, []), path: wordPagePath(entSeq) }
}

// Search databases known to hold an import. Only a finished import is remembered, so a
// database that has none yet is checked again on the next request.
const importedDatabases = new WeakSet<D1Database>()

/**
 * Whether the search database holds a complete import; the import writes `dictionary_import`
 * last. The local SEARCH_DB has no tables until `scripts/release-d1/load-local.sh search` loads
 * one.
 */
async function holdsImport(db: D1Database): Promise<boolean> {
  if (importedDatabases.has(db)) return true
  const table = await db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'dictionary_import'")
    .first()
  if (!table || (await db.prepare('SELECT 1 FROM dictionary_import').first()) === null) return false
  importedDatabases.add(db)
  return true
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

async function searchWords(query: string): Promise<SearchWord[]> {
  const { env } = await getCloudflareContext({ async: true })
  const db = env.SEARCH_DB
  // A failing database throws, so the request fails rather than rendering an empty page.
  if (!db || !(await holdsImport(db))) return fixtureWords(query)
  try {
    const { items } = await websiteSearch(db).search(query)
    return items.map(item => summarizeSearchEntry(item.entry))
  } catch (error) {
    // Like the app, a query full-text search can't read shows no results.
    if (isUnreadableQuery(error)) return []
    throw error
  }
}

/** Memoized per request, so the page and its metadata search once. */
export const searchDictionary = cache(async (query: string): Promise<SearchData> => {
  // No kanji in the search database yet, so the kanji card still comes from the fixtures.
  const kanji = kanjiRowsByCharacter.get(query)?.kanji
  return {
    query,
    kanji: kanji
      ? { character: kanji.character, meanings: kanji.meanings, path: kanjiPath(kanji.character) }
      : null,
    words: await searchWords(query)
  }
})
