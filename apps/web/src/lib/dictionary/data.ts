import { getCloudflareContext } from '@opennextjs/cloudflare'
import { cache } from 'react'
import {
  fixtureEntries,
  fixtureExamples,
  fixtureFrequency,
  fixtureKanji,
  fixtureSearchOrder
} from '@/lib/dictionary/fixtures'
import { isProductionSite } from '@/lib/site'
import { furigana, partOfSpeechPhrase, pitchMorae, primaryKanji, type RubySegment } from './display'
import type {
  EntryRecord,
  ExampleRecord,
  FrequencyRecord,
  KanjiReadingRecord,
  KanjiRecord,
  SenseRecord
} from './records'
import type { SearchEntry } from './search/search'
import { websiteSearch } from './search/website'
import { kanjiPath, wordPath, wordSlug } from './urls'

// Pages read the dictionary only through this module. Search runs on the search database
// (SEARCH_DB) when it holds an import; everything else serves local fixtures until its data is
// in D1 (#465). Only these functions change as it moves.

/** Production shows no dictionary pages until real data is loaded, so fixtures are never indexed. */
export function isDictionaryAvailable(): boolean {
  return !isProductionSite()
}

export interface WordSummary {
  entSeq: number
  headword: string
  reading: string
  ruby: RubySegment[]
  summary: string
  path: string
  frequency: FrequencyRecord[]
}

export interface WordPageData extends WordSummary {
  /** Where the word's page lives now; a request under another slug redirects here. */
  slug: string
  partOfSpeech: string
  pitch: { morae: { mora: string; high: boolean }[]; downstep: number } | null
  senses: SenseRecord[]
  kanji: { character: string; meaning: string | null; path: string | null }[]
  examples: ExampleRecord[]
}

export interface KanjiPageData extends Omit<KanjiRecord, 'readings' | 'words'> {
  readings: (Omit<KanjiReadingRecord, 'words'> & {
    words: { headword: string; summary: string; path: string | null }[]
  })[]
  words: WordSummary[]
}

/** A search result; `path` is null when the word has no page yet (#465). */
export interface SearchWord extends Omit<WordSummary, 'path'> {
  path: string | null
}

export interface SearchData {
  query: string
  kanji: { character: string; meanings: string[]; path: string } | null
  words: SearchWord[]
}

const entriesBySeq = new Map(fixtureEntries.map(entry => [entry.entSeq, entry]))
const kanjiByCharacter = new Map(fixtureKanji.map(kanji => [kanji.character, kanji]))

function summarize(entry: EntryRecord): WordSummary {
  return {
    entSeq: entry.entSeq,
    headword: entry.headword,
    reading: entry.reading,
    ruby: furigana(entry.headword, entry.reading),
    summary: entry.summary,
    path: wordPath(entry),
    frequency: fixtureFrequency[entry.entSeq] ?? []
  }
}

export async function getWordPage(entSeq: number): Promise<WordPageData | null> {
  const entry = entriesBySeq.get(entSeq)
  if (!entry) return null
  const characters = primaryKanji(entry.headword)
  return {
    ...summarize(entry),
    slug: wordSlug(entry.headword, entry.reading),
    // The first sense's word class, as the app's displayPartOfSpeech.
    partOfSpeech: partOfSpeechPhrase(entry.senses[0]?.partsOfSpeech ?? entry.partsOfSpeech),
    pitch: entry.pitch
      ? { morae: pitchMorae(entry.reading, entry.pitch.downstep), downstep: entry.pitch.downstep }
      : null,
    senses: entry.senses,
    kanji: characters.map(character => {
      const kanji = kanjiByCharacter.get(character)
      return {
        character,
        meaning: kanji ? kanji.meanings.slice(0, 2).join(', ') : null,
        path: kanji ? kanjiPath(character) : null
      }
    }),
    examples: fixtureExamples[entry.entSeq] ?? []
  }
}

export async function getKanjiPage(character: string): Promise<KanjiPageData | null> {
  const kanji = kanjiByCharacter.get(character)
  if (!kanji) return null
  return {
    ...kanji,
    readings: kanji.readings.map(reading => ({
      ...reading,
      words: reading.words.map(word => {
        const entry = fixtureEntries.find(
          candidate =>
            candidate.headword === word.headword && candidate.summary.startsWith(word.summary)
        )
        return { ...word, path: entry ? wordPath(entry) : null }
      })
    })),
    words: kanji.words.flatMap(entSeq => {
      const entry = entriesBySeq.get(entSeq)
      return entry ? [summarize(entry)] : []
    })
  }
}

/** A search result as a word. The search database has no frequency yet. */
export function summarizeSearchEntry(entry: SearchEntry): SearchWord {
  const word = { entSeq: entry.sourceRecordId, headword: entry.headword, reading: entry.reading }
  return {
    ...word,
    ruby: furigana(entry.headword, entry.reading),
    summary: entry.summary,
    // Word pages serve only fixture entries, so only those link until #465 removes this.
    path: entriesBySeq.has(word.entSeq) ? wordPath(word) : null,
    frequency: []
  }
}

// Search databases known to hold an import. Only a finished import is remembered, so a
// database that has none yet is checked again on the next request.
const importedDatabases = new WeakSet<D1Database>()

/**
 * Whether the search database holds a complete import; the import writes `dictionary_import`
 * last. The local SEARCH_DB has no tables until scripts/search-d1/load-local.sh loads one.
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

function fixtureWords(query: string): WordSummary[] {
  const ordered = Object.hasOwn(fixtureSearchOrder, query) ? fixtureSearchOrder[query] : undefined
  const matches = ordered
    ? ordered.flatMap(entSeq => entriesBySeq.get(entSeq) ?? [])
    : fixtureEntries.filter(
        entry =>
          entry.headword === query ||
          entry.reading === query ||
          entry.summary.toLowerCase().split(/[,;] /).includes(query)
      )
  return matches.map(summarize)
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
  const kanji = kanjiByCharacter.get(query)
  return {
    query,
    kanji: kanji
      ? { character: kanji.character, meanings: kanji.meanings, path: kanjiPath(kanji.character) }
      : null,
    words: await searchWords(query)
  }
})
