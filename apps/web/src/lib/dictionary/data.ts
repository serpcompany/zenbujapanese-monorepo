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

export interface SearchData {
  query: string
  kanji: { character: string; meanings: string[]; path: string } | null
  words: WordSummary[]
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
export function summarizeSearchEntry(entry: SearchEntry): WordSummary {
  const word = { entSeq: entry.sourceRecordId, headword: entry.headword, reading: entry.reading }
  return {
    ...word,
    ruby: furigana(entry.headword, entry.reading),
    summary: entry.summary,
    path: wordPath(word),
    frequency: []
  }
}

// Whether each search database holds an import, read once per isolate.
const importedDatabases = new WeakMap<D1Database, Promise<boolean>>()

/**
 * Whether the search database holds a complete import; the import writes `dictionary_import`
 * last. The local SEARCH_DB has no tables until scripts/search-d1/load-local.sh loads one.
 */
function holdsImport(db: D1Database): Promise<boolean> {
  let imported = importedDatabases.get(db)
  if (!imported) {
    imported = (async () => {
      const table = await db
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'dictionary_import'")
        .first()
      if (!table) return false
      return (await db.prepare('SELECT 1 FROM dictionary_import').first()) !== null
    })()
    imported.catch(() => importedDatabases.delete(db))
    importedDatabases.set(db, imported)
  }
  return imported
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

async function searchWords(query: string): Promise<WordSummary[]> {
  const { env } = await getCloudflareContext({ async: true })
  const db = env.SEARCH_DB
  try {
    if (!db || !(await holdsImport(db))) return fixtureWords(query)
    const { items } = await websiteSearch(db).search(query)
    return items.map(item => summarizeSearchEntry(item.entry))
  } catch (error) {
    // Like the app, a search that throws (the database failed, or an English query can't be
    // read as full text) shows no results.
    console.error('Dictionary search failed', { query, error })
    return []
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
