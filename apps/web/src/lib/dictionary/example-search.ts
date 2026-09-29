// Example search on the search database (SEARCH_DB, #511): the count Search's "View N Example
// Sentences" row shows, and the sentences its Example Sentences page lists, with each word linked
// as the app links it on that screen. The core is ./examples/search.ts; this reads its candidates
// and the sentences from D1, and answers broad searches from what the import precomputed
// (example_search_cache, scripts/release-d1/search/build-examples.mts). data.ts adds the links'
// pages; the example-search gate (examples/conformance.test.ts) reads the local copy through here.

import type {
  ExampleLinkRow,
  ExampleSentenceRow,
  ExampleSentenceTokenRow,
  ExampleWordRow,
  WordExampleRows
} from './detail/rows'
import {
  displayReading,
  type HighlightedEntry,
  type LinkedToken,
  linkPlanned,
  type PlannedWord
} from './examples/linking'
import {
  type ExampleSearchResult,
  type ExampleSearchSource,
  englishFtsQuery,
  exampleCandidateLimit,
  exampleSearchKey,
  isPlainEnglishQuery,
  japaneseCharacters,
  noExamples,
  type SearchSentence,
  searchExamples
} from './examples/search'
import { primaryItem } from './results/results'
import { fts5Phrase } from './search/fts'
import { normalizeQuery } from './search/query'
import type { SearchResults } from './search/search'

/** An entry as example search reads it: its examples, and the forms that link words to it. */
export interface ExampleEntry {
  id: string
  entSeq: number
  writtenForms: string[]
  readingForms: string[]
  /** Its examples' sentence IDs, in the app's order (at most 100). */
  sentenceIds: number[]
}

/** A sentence as the Example Sentences page reads it. */
export interface SearchSentenceRow extends SearchSentence {
  words: ExampleWordRow[]
  japaneseTatoebaId: number
  japaneseContributor: string | null
  japaneseLicense: string
  englishTatoebaId: number
  englishContributor: string | null
  englishLicense: string
}

export interface WebsiteExampleSearch {
  /** `ExampleSentenceClient.search` and `count` for the query. */
  search(query: string): Promise<ExampleSearchResult>
  /** An entry's forms and examples; null for an unknown entry. */
  entry(id: string): Promise<ExampleEntry | null>
  /** Sentences by ID, in the order asked for. */
  sentences(ids: number[]): Promise<SearchSentenceRow[]>
}

const candidateColumns = 's.id, s.pair_id, s.japanese, s.english'

interface CandidateRow {
  id: number
  pair_id: string
  japanese: string
  english: string
}

const candidate = (row: CandidateRow): SearchSentence => ({
  id: row.id,
  pairId: row.pair_id,
  japanese: row.japanese,
  english: row.english
})

/** Thrown when a plain English search has more candidates than the page reads. */
class TooBroad extends Error {}

/**
 * Candidates from the search database's full-text indexes. A plain English query with more than
 * `exampleCandidateLimit` candidates stops there: the import precomputed every such search that
 * can list anything, so an uncached one lists nothing.
 */
function d1Source(db: D1Database, plain: boolean): ExampleSearchSource {
  return {
    async english(phrase) {
      const limit = plain ? exampleCandidateLimit + 1 : -1
      const { results } = await db
        .prepare(
          `SELECT ${candidateColumns} FROM example_sentences s WHERE s.id IN (
             SELECT rowid FROM example_english_fts WHERE example_english_fts MATCH ? LIMIT ?)`
        )
        .bind(englishFtsQuery(phrase), limit)
        .all<CandidateRow>()
      if (plain && results.length > exampleCandidateLimit) throw new TooBroad()
      return results.map(candidate)
    },
    async japanese(text) {
      const characters = japaneseCharacters(text)
      // The import checks that sentences hold no other characters but spaces, which a query
      // never keeps, so a query without any can't be in one.
      if (characters.length === 0) return []
      const { results } = await db
        .prepare(
          `SELECT ${candidateColumns} FROM example_sentences s WHERE s.id IN (
             SELECT rowid FROM example_japanese_chars WHERE example_japanese_chars MATCH ?)
           AND instr(s.japanese, ?) > 0`
        )
        .bind(fts5Phrase(characters.join(' ')), text)
        .all<CandidateRow>()
      return results.map(candidate)
    }
  }
}

export function websiteExampleSearch(db: D1Database): WebsiteExampleSearch {
  return {
    async search(rawQuery) {
      const query = normalizeQuery(rawQuery)
      const hit = await db
        .prepare(
          'SELECT count, truncated, sentence_ids_json FROM example_search_cache WHERE key = ?'
        )
        .bind(exampleSearchKey(query))
        .first<{ count: number; truncated: number; sentence_ids_json: string }>()
      if (hit) {
        return {
          ids: JSON.parse(hit.sentence_ids_json),
          count: hit.count,
          truncated: hit.truncated === 1
        }
      }
      try {
        return await searchExamples(query, d1Source(db, isPlainEnglishQuery(query)))
      } catch (error) {
        if (error instanceof TooBroad) return noExamples
        throw error
      }
    },

    async entry(id) {
      const row = await db
        .prepare(
          `SELECT ent_seq, written_forms_json, reading_forms_json, sentence_ids_json
           FROM example_entries WHERE entry_id = ?`
        )
        .bind(id)
        .first<{
          ent_seq: number
          written_forms_json: string
          reading_forms_json: string
          sentence_ids_json: string | null
        }>()
      if (!row) return null
      return {
        id,
        entSeq: row.ent_seq,
        writtenForms: JSON.parse(row.written_forms_json),
        readingForms: JSON.parse(row.reading_forms_json),
        sentenceIds: row.sentence_ids_json ? JSON.parse(row.sentence_ids_json) : []
      }
    },

    async sentences(ids) {
      if (ids.length === 0) return []
      const { results } = await db
        .prepare(
          `SELECT id, pair_id, japanese, english, words_json, japanese_tatoeba_id,
             japanese_contributor, japanese_license, english_tatoeba_id, english_contributor,
             english_license
           FROM example_sentences WHERE id IN (SELECT value FROM json_each(?))`
        )
        .bind(JSON.stringify(ids))
        .all<Record<string, string | number | null>>()
      const byId = new Map(
        results.map(row => [
          row.id as number,
          {
            id: row.id as number,
            pairId: row.pair_id as string,
            japanese: row.japanese as string,
            english: row.english as string,
            words: JSON.parse(row.words_json as string),
            japaneseTatoebaId: row.japanese_tatoeba_id as number,
            japaneseContributor: row.japanese_contributor as string | null,
            japaneseLicense: row.japanese_license as string,
            englishTatoebaId: row.english_tatoeba_id as number,
            englishContributor: row.english_contributor as string | null,
            englishLicense: row.english_license as string
          }
        ])
      )
      return ids.map(id => {
        const row = byId.get(id)
        if (!row) throw new Error(`The search database has no example sentence ${id}`)
        return row
      })
    }
  }
}

/** The entry the Example Sentences screen links words to, with its headword and reading. */
export type PrimaryExampleEntry = ExampleEntry & { headword: string; reading: string }

/**
 * The results' primary entry (`LookupSearchResults.primaryEntry(for:)`), which the examples row
 * opens and the Example Sentences screen links words to; null without results.
 */
export async function primaryExampleEntry(
  search: WebsiteExampleSearch,
  results: SearchResults,
  query: string
): Promise<PrimaryExampleEntry | null> {
  const primary = primaryItem(results, query)
  if (!primary) return null
  const entry = await search.entry(primary.entry.id)
  return entry
    ? { ...entry, headword: primary.entry.headword, reading: primary.entry.reading }
    : null
}

/** The Example Sentences row's count for a search's results, as the page and its gate read it. */
export async function resultsExampleCount(
  search: WebsiteExampleSearch,
  results: SearchResults,
  query: string
): Promise<number> {
  const primary = results.usesPrimaryEntryExamples
    ? await primaryExampleEntry(search, results, query)
    : null
  return exampleCount(search, query, primary, results.usesPrimaryEntryExamples)
}

/**
 * The Example Sentences screen's list (`ExampleSentencesScreen.examples`): the primary entry's
 * examples when the results use them, otherwise the sentences that contain the query.
 */
export async function listedExamples(
  search: WebsiteExampleSearch,
  query: string,
  primary: ExampleEntry | null,
  usesPrimaryEntryExamples: boolean
): Promise<{ ids: number[]; truncated: boolean }> {
  if (usesPrimaryEntryExamples && primary) return { ids: primary.sentenceIds, truncated: false }
  const found = await search.search(query)
  return { ids: found.ids, truncated: found.truncated }
}

/**
 * `SearchResultsScreen.exampleCount`: the primary entry's examples (at most 100) when the results
 * use them, otherwise the count of sentences that contain the query (51 for more than 50).
 */
export async function exampleCount(
  search: WebsiteExampleSearch,
  query: string,
  primary: ExampleEntry | null,
  usesPrimaryEntryExamples: boolean
): Promise<number> {
  if (usesPrimaryEntryExamples && primary) return primary.sentenceIds.length
  return (await search.search(query)).count
}

/** A search's Example Sentences: what it lists, and the entry it links words to. */
export interface SearchExampleList {
  primary: PrimaryExampleEntry | null
  ids: number[]
  truncated: boolean
}

/** The Example Sentences screen a search's row opens, as the page and its gate read it. */
export async function searchExampleList(
  search: WebsiteExampleSearch,
  results: SearchResults,
  query: string
): Promise<SearchExampleList> {
  const primary = await primaryExampleEntry(search, results, query)
  const listed = await listedExamples(search, query, primary, results.usesPrimaryEntryExamples)
  return { primary, ...listed }
}

/** `limit` of the list's examples from position `from`, as the page shows them. */
export async function searchExamplePage(
  search: WebsiteExampleSearch,
  list: SearchExampleList,
  query: string,
  from: number,
  limit: number
): Promise<WordExampleRows[]> {
  const sentences = await search.sentences(list.ids.slice(from, from + limit))
  return sentences.map((sentence, index) =>
    searchExampleRows(sentence, from + index, normalizeQuery(query), list.primary)
  )
}

/** Where a planned word's entries point: its `ent_seq`s stand in for Language Reference IDs. */
function plannedWord(text: string, start: number, row: ExampleWordRow): PlannedWord {
  const surface = text.slice(start, start + row.n)
  let offset = start
  return {
    surface,
    // Only the furigana of words with kanji is kept; linking reads no other reading.
    reading: row.r ?? '',
    dictionaryForm: row.d ?? surface,
    normalizedForm: row.d ?? surface,
    candidates: (row.e ?? []).map(entSeq => ({
      id: String(entSeq),
      reading: '',
      partsOfSpeech: []
    })),
    pieces: row.p
      ? row.p.map(piece => {
          const word = plannedWord(text, offset, piece)
          offset += piece.n
          return word
        })
      : null,
    ...(row.u ? { unanalyzed: true as const } : {})
  }
}

/** A word with kanji or 々 has furigana (JapaneseRubyAnnotation). */
const hasKanji = (text: string) => /[㐀-鿿々]/u.test(text)

/** `ExampleSentencesScreen.queryScalarRanges`: every occurrence of the query, in scalars. */
export function queryScalarRanges(text: string, query: string): [number, number][] {
  const scalars = Array.from(text)
  const needle = Array.from(query)
  if (needle.length === 0 || needle.length > scalars.length) return []
  const ranges: [number, number][] = []
  for (let start = 0; start + needle.length <= scalars.length; start++) {
    if (needle.every((scalar, index) => scalars[start + index] === scalar)) {
      ranges.push([start, start + needle.length])
    }
  }
  return ranges
}

/**
 * One sentence as the Example Sentences screen shows it (LinkedJapaneseText with the `.dedicated`
 * presentation): its words linked for the query's primary entry (`linkedTokens(text, query,
 * entry)`), and the words that make up an occurrence of the query accented, in the rows a word
 * page's examples use.
 */
export function searchExampleRows(
  sentence: SearchSentenceRow,
  position: number,
  query: string,
  entry: PrimaryExampleEntry | null
): WordExampleRows {
  const { japanese } = sentence
  let offset = 0
  const words = sentence.words.map(row => {
    const word = { row, planned: plannedWord(japanese, offset, row) }
    offset += row.n
    return word
  })
  const highlighted: { entry: HighlightedEntry; query: string } | null = entry
    ? {
        entry: {
          id: String(entry.entSeq),
          reading: entry.reading,
          partsOfSpeech: [],
          headword: entry.headword,
          writtenForms: entry.writtenForms,
          readingForms: entry.readingForms
        },
        query
      }
    : null
  const linked: LinkedToken[] = linkPlanned(
    words.map(word => word.planned),
    highlighted
  )

  // Each linked word's stored row: the whole word, or its pieces when it split.
  const sources: ExampleWordRow[] = []
  let cursor = 0
  for (const { row, planned } of words) {
    if (linked[cursor]?.surface === planned.surface || !row.p) {
      sources.push(row)
      cursor += 1
    } else {
      sources.push(...row.p)
      cursor += row.p.length
    }
  }

  const tokens: ExampleSentenceTokenRow[] = []
  const links: ExampleLinkRow[] = []
  const highlights: number[] = []
  const ranges = queryScalarRanges(japanese, query)
  let scalar = 0
  for (const [index, token] of linked.entries()) {
    const source = sources[index]
    const row: ExampleSentenceTokenRow = { text: token.surface }
    if (source.r !== undefined) row.reading = source.r
    if (source.d !== undefined) row.dictionaryForm = source.d
    tokens.push(row)
    if (token.candidates.length > 0) {
      const link: ExampleLinkRow = {
        token: index,
        entSeqs: token.candidates.map(({ id }) => Number(id))
      }
      // The furigana over a word linked to one entry, when it isn't Kuromoji's: the entry's
      // reading where the word is one of its forms (LinkedTokenView's `displayReading`).
      if (token.entry && hasKanji(token.surface)) {
        const reading =
          highlighted !== null && token.entry === highlighted.entry
            ? displayReading({ surface: token.surface, reading: source.r ?? '' }, highlighted.entry)
            : (source.f ?? source.r)
        if (reading !== undefined && reading !== source.r) link.reading = reading
      }
      links.push(link)
    }
    const length = Array.from(token.surface).length
    if (ranges.some(([start, end]) => start < scalar + length && scalar < end)) {
      highlights.push(index)
    }
    scalar += length
  }

  const exampleSentence: ExampleSentenceRow = {
    id: sentence.id,
    pairId: sentence.pairId,
    japanese,
    english: sentence.english,
    tokens,
    japaneseTatoebaId: sentence.japaneseTatoebaId,
    japaneseContributor: sentence.japaneseContributor,
    japaneseLicense: sentence.japaneseLicense,
    englishTatoebaId: sentence.englishTatoebaId,
    englishContributor: sentence.englishContributor,
    englishLicense: sentence.englishLicense
  }
  return {
    sentence: exampleSentence,
    example: {
      entSeq: entry?.entSeq ?? 0,
      position,
      sentenceId: sentence.id,
      highlights,
      links,
      tokens: null
    }
  }
}
