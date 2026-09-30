// The dictionary a client serves from the artifact (ADR 0009): search, word, kanji, and example
// responses, made from the artifact when asked, with the capabilities the client supplies. The
// website's service (apps/dictionary-api) answers each request with one of these, and the
// website renders them (apps/web/src/lib/dictionary/data.ts). Responses are plain JSON: maps are
// records keyed by JMdict entry number.

import { conjugationTable } from '../detail/conjugation'
import { examplesPerPage } from '../detail/examples'
import type { FormExampleRows, KanjiRows, WordExampleRows, WordRows } from '../detail/rows'
import { wordSlug } from '../detail/slug'
import type { LinkEntry } from '../examples/linking'
import type { Tokenize } from '../examples/morphology'
import { loadFrequency, type SearchResultsScreen, searchResultsScreen } from '../results/results'
import { normalizeQuery } from '../search/query'
import {
  DictionarySearch,
  type MorphologyAnalyzer,
  type SearchFeatures,
  type SearchResults
} from '../search/search'
import { type Cache, LruCache } from './cache'
import { type ArtifactDatabase, searchDatabase } from './database'
import {
  type EntryExamples,
  type ExampleSentence,
  retrieveEntryExamples
} from './example-retrieval'
import { searchExamples } from './example-search'
import { readKanji } from './kanji'
import type { KanjiData } from './kanji-data'
import { formLookup } from './lookup'
import { primaryExamplesEntry, resultsExampleCount, resultsExamples } from './search-examples'
import {
  conjugatedFormExamples,
  type ExamplesEntry,
  exampleCount,
  exampleLinkEntSeqs,
  exampleRows,
  wordExampleRows
} from './word-examples'
import { canonicalEntryId, jmdictSource, readWord, slugsByEntSeq } from './words'

/** A page's links: each linked word's page slug, by JMdict entry number. */
export type Slugs = Record<number, string>

export interface SearchResponse {
  screen: SearchResultsScreen
  /** Whether a one-kanji query's kanji has a page. */
  kanjiHasPage: boolean
}

export interface WordResponse {
  rows: WordRows
  /** The slug the word's page lives under. */
  slug: string
  /** Related words' and the first examples' linked words' slugs. */
  slugs: Slugs
  /** The characters in its forms that have a kanji page. */
  kanjiPages: string[]
}

export interface ExamplesResponse {
  rows: WordExampleRows[]
  slugs: Slugs
}

/** A word's conjugation screens: its rows without examples, and the slug its pages live under. */
export interface ConjugationWordResponse {
  rows: WordRows
  slug: string
}

/** A conjugated form's examples, by its spelling: a page of them, and how many it lists. */
export interface FormExamplesResponse {
  rows: FormExampleRows[]
  /** How many examples the form lists, at most 100. */
  listed: number
  slugs: Slugs
}

/** A search's examples page: what the Example Sentences row opens. */
export interface SearchExamplesResponse extends ExamplesResponse {
  /** The query, as normalized. */
  query: string
  /** How many examples there are in all: the listed count, at most 100. */
  listed: number
  /** Whether more than 100 matched, so some aren't listed. */
  truncated: boolean
  /** Whether it lists the primary entry's examples (a romaji or deinflected query). */
  usesPrimaryEntryExamples: boolean
}

export interface KanjiResponse {
  rows: KanjiRows
  indexable: boolean
  /** Its words' slugs. */
  slugs: Slugs
  /** Its components and element glyphs that have a kanji page. */
  kanjiPages: string[]
}

/** A word sitemap: 50,000 word pages at most, in entry-number order. */
export interface WordSitemap {
  number: number
  firstEntSeq: number
  lastEntSeq: number
  urlCount: number
}

export interface DictionaryCapabilities {
  /** The app's Kuromoji: example linking and a conjugated form's examples. */
  tokenize: Tokenize
  /** The app's Sudachi: sentence search (Discovered Words). Off without it. */
  morphology?: MorphologyAnalyzer
}

export interface DictionaryOptions {
  db: ArtifactDatabase
  kanji: KanjiData
  capabilities: DictionaryCapabilities
  /** How many responses of each kind to keep. */
  cacheSize?: number
}

/**
 * Whether a search failed because the artifact's full-text search (FTS4) couldn't read the query.
 * Only its own parser errors: a bare "syntax error" would also hide a real SQL bug as "no results".
 */
export function isUnreadableQuery(error: unknown): boolean {
  const unreadable = /malformed MATCH|unterminated string/i
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    if (unreadable.test(cause.message)) return true
  }
  return false
}

/** A query's Example Sentences: the primary entry's, or the sentences containing the query. */
interface QueryExamples {
  /** The entry the screen highlights, whose words link to it. */
  primary: ExamplesEntry | null
  /** Whether it lists the primary entry's examples, for a romaji or deinflected query. */
  usesPrimaryEntryExamples: boolean
  /** Null where the app's retrieval throws, so it offers none. */
  examples: EntryExamples | null
}

/** The sitemap protocol's limit per file. */
export const sitemapUrlLimit = 50_000

/**
 * The longest query or conjugated form the service reads, in code points. The website answers a
 * longer one itself: a search that finds nothing.
 */
export const maximumQueryLength = 200

/** Whether a query or form is within `maximumQueryLength`. */
export const isReadableLength = (text: string) => Array.from(text).length <= maximumQueryLength

/** The highest JMdict entry number the service looks up; any higher number names no word. */
export const maximumEntSeq = 99_999_999

const toRecord = (slugs: Map<number, string>): Slugs => Object.fromEntries(slugs)

export class Dictionary {
  readonly features: SearchFeatures
  private readonly db: ArtifactDatabase
  private readonly kanjiData: KanjiData
  private readonly capabilities: DictionaryCapabilities
  private readonly searchCore: DictionarySearch
  private readonly lookup: ReturnType<typeof formLookup>
  private readonly searches: Cache<string, SearchResponse>
  private readonly queryExamples: Cache<string, QueryExamples>
  private readonly forms: Cache<string, ExampleSentence[]>
  private readonly retrieved: Cache<string, EntryExamples | null>
  private readonly kanjiPages: Cache<string, KanjiResponse | null>
  private sitemaps: WordSitemap[] | null = null

  constructor(options: DictionaryOptions) {
    const size = options.cacheSize ?? 2_000
    this.db = options.db
    this.kanjiData = options.kanji
    this.capabilities = options.capabilities
    this.searchCore = new DictionarySearch(searchDatabase(options.db), {
      morphology: options.capabilities.morphology
    })
    this.features = this.searchCore.features
    this.lookup = formLookup(options.db, new LruCache<string, LinkEntry[]>(size * 20))
    this.searches = new LruCache(size)
    // Each holds up to 100 sentences, so fewer are kept.
    this.queryExamples = new LruCache(Math.max(1, Math.floor(size / 4)))
    this.forms = new LruCache(Math.max(1, Math.floor(size / 4)))
    this.retrieved = new LruCache(size)
    this.kanjiPages = new LruCache(size)
  }

  private get linking() {
    return { tokenize: this.capabilities.tokenize, lookup: this.lookup }
  }

  /** The search core's results for a query, before the results screen orders them. */
  searchResults(rawQuery: string): Promise<SearchResults> {
    return this.searchCore.search(normalizeQuery(rawQuery))
  }

  /** The search core's results for a normalized query; one full-text search can't read finds nothing. */
  private async readableResults(query: string): Promise<SearchResults> {
    try {
      return await this.searchCore.search(query)
    } catch (error) {
      // Any other failure is the database's.
      if (!isUnreadableQuery(error)) throw error
      return this.searchCore.search('')
    }
  }

  /**
   * A normalized query's examples: the Example Sentences row counts them and its page lists them,
   * so the results page, the examples page, and each page of more examples retrieve them once.
   */
  private async examplesFor(query: string, found?: SearchResults): Promise<QueryExamples> {
    const cached = this.queryExamples.get(query)
    if (cached) return cached
    const results = found ?? (await this.readableResults(query))
    const primary = primaryExamplesEntry(this.db, query, results)
    const { usesPrimaryEntryExamples } = results
    const examples = {
      primary,
      usesPrimaryEntryExamples,
      examples: resultsExamples(this.db, query, primary, usesPrimaryEntryExamples)
    }
    this.queryExamples.set(query, examples)
    return examples
  }

  /** The search results screen for a query. */
  async search(rawQuery: string): Promise<SearchResponse> {
    const query = normalizeQuery(rawQuery)
    const cached = this.searches.get(query)
    if (cached) return cached
    const results = await this.readableResults(query)
    const frequency = await loadFrequency(searchDatabase(this.db), results)
    const { usesPrimaryEntryExamples, examples } = await this.examplesFor(query, results)
    const count = resultsExampleCount(usesPrimaryEntryExamples, examples)
    const response: SearchResponse = {
      screen: searchResultsScreen(query, results, frequency, count),
      kanjiHasPage: this.kanjiData.has(query)
    }
    this.searches.set(query, response)
    return response
  }

  /**
   * What a search's Example Sentences row opens, from position `from`: the primary entry's
   * examples for a romaji or deinflected query, otherwise the sentences containing the query. As
   * in the app's ExampleSentencesView, each occurrence of the query is accented.
   */
  async searchExamples(
    rawQuery: string,
    from = 0,
    limit = examplesPerPage
  ): Promise<SearchExamplesResponse | null> {
    const query = normalizeQuery(rawQuery)
    const { primary, usesPrimaryEntryExamples, examples } = await this.examplesFor(query)
    if (!examples || examples.sentences.length === 0) return null
    const rows = exampleRows(
      this.db,
      examples.sentences.slice(from, from + limit),
      from,
      { entry: primary, query, accent: 'query' },
      this.linking
    )
    return {
      query,
      listed: examples.sentences.length,
      truncated: examples.truncated,
      usesPrimaryEntryExamples,
      rows,
      slugs: toRecord(slugsByEntSeq(this.db, exampleLinkEntSeqs(rows)))
    }
  }

  /** The examples the app lists for a word page's entry (its equivalence group's). */
  private entryExamples(entry: ExamplesEntry): EntryExamples | null {
    const cached = this.retrieved.get(entry.id)
    if (cached !== undefined) return cached
    const found = retrieveEntryExamples(this.db, entry)
    const examples = typeof found === 'string' ? null : found
    this.retrieved.set(entry.id, examples)
    return examples
  }

  /** The entry a word page's examples are retrieved for and accent. */
  private examplesEntry(fingerprint: string): ExamplesEntry {
    const id = canonicalEntryId(this.db, fingerprint)
    const [row] = this.db.all<{
      headword: string
      reading: string
      parts_of_speech_json: string
      written_forms_json: string
      reading_forms_json: string
    }>(
      `SELECT headword, reading, parts_of_speech_json, written_forms_json, reading_forms_json
       FROM entries WHERE id = unhex(?)`,
      [id]
    )
    if (!row) throw new Error(`No entry ${id}`)
    const values = (json: string) =>
      (JSON.parse(json) as { value: string }[]).map(form => form.value)
    return {
      id,
      headword: row.headword,
      reading: row.reading,
      partsOfSpeech: JSON.parse(row.parts_of_speech_json),
      writtenForms: values(row.written_forms_json),
      readingForms: values(row.reading_forms_json)
    }
  }

  /** A word page, or null for a number the artifact doesn't hold. */
  word(entSeq: number): WordResponse | null {
    const word = readWord(this.db, this.kanjiData, entSeq)
    if (!word) return null
    const entry = this.examplesEntry(word.fingerprint)
    const retrieved = this.entryExamples(entry)
    const examples = retrieved
      ? wordExampleRows(this.db, entSeq, entry, retrieved, 0, examplesPerPage, this.linking)
      : []
    const slugs = new Map([
      ...word.relatedSlugs,
      ...slugsByEntSeq(this.db, exampleLinkEntSeqs(examples))
    ])
    return {
      rows: {
        entry: word.entry,
        frequency: word.frequency,
        kanji: word.kanji,
        examples,
        exampleCount: retrieved ? exampleCount(retrieved) : null
      },
      slug: word.slug,
      slugs: toRecord(slugs),
      kanjiPages: word.kanji.map(kanji => kanji.character)
    }
  }

  /** `limit` of a word's examples from position `from`, or null for an unknown word. */
  wordExamples(entSeq: number, from: number, limit = examplesPerPage): ExamplesResponse | null {
    const [row] = this.db.all<{ fingerprint: string }>(
      `SELECT lower(hex(semantic_fingerprint)) AS fingerprint FROM entries
       WHERE source_identity = ? AND source_record_id = ?`,
      [jmdictSource, entSeq]
    )
    if (!row) return null
    const entry = this.examplesEntry(row.fingerprint)
    const retrieved = this.entryExamples(entry)
    const rows = retrieved
      ? wordExampleRows(this.db, entSeq, entry, retrieved, from, limit, this.linking)
      : []
    return { rows, slugs: toRecord(slugsByEntSeq(this.db, exampleLinkEntSeqs(rows))) }
  }

  /**
   * What a word's conjugation table and form screens show: its rows without examples, which they
   * don't list, and its slug; null for an unknown word, or one whose part of speech opens no table.
   */
  conjugationWord(entSeq: number): ConjugationWordResponse | null {
    const word = readWord(this.db, this.kanjiData, entSeq)
    if (!word || !conjugationTable(word.entry)) return null
    return {
      rows: {
        entry: word.entry,
        frequency: word.frequency,
        kanji: word.kanji,
        examples: [],
        exampleCount: null
      },
      slug: word.slug
    }
  }

  /**
   * The sentences a conjugated form's screen lists (`ConjugatedFormView.loadExamples`), by its
   * spelling: the app's search for it, normalized as the search normalizes it (so a full-width Ｈ
   * searches English), then those whose text contains the form as written and in which Kuromoji
   * reads it as one word, at most 100.
   */
  formSentences(form: string): ExampleSentence[] {
    const cached = this.forms.get(form)
    if (cached) return cached
    const searched = searchExamples(this.db, form)
    const sentences =
      typeof searched === 'string'
        ? []
        : conjugatedFormExamples(searched, form, this.capabilities.tokenize)
    this.forms.set(form, sentences)
    return sentences
  }

  /**
   * `limit` of a conjugated form's examples from position `from`, accenting the form, with how
   * many it lists. The screen has no page entry, so words link as no word page sees them.
   */
  formExamples(form: string, from = 0, limit = examplesPerPage): FormExamplesResponse {
    const sentences = this.formSentences(form)
    // The screen accents the query it searched, as normalized (`SearchQuery(form.surface)`).
    const rows = exampleRows(
      this.db,
      sentences.slice(from, from + limit),
      from,
      { entry: null, query: normalizeQuery(form), accent: 'query' },
      this.linking
    ).map(({ sentence, example }) => ({
      sentence,
      example: {
        surface: form,
        position: example.position,
        sentenceId: example.sentenceId,
        highlights: example.highlights,
        links: example.links
      }
    }))
    return {
      rows,
      listed: sentences.length,
      slugs: toRecord(slugsByEntSeq(this.db, exampleLinkEntSeqs(rows)))
    }
  }

  /** A kanji page, or null for a character without one. */
  kanji(character: string): KanjiResponse | null {
    const cached = this.kanjiPages.get(character)
    if (cached !== undefined) return cached
    const rows = readKanji(this.db, this.kanjiData, character)
    const response = rows
      ? {
          rows,
          indexable: this.kanjiData.isIndexable(character),
          slugs: toRecord(
            slugsByEntSeq(
              this.db,
              rows.words.map(word => word.entSeq)
            )
          ),
          kanjiPages: [
            ...new Set([...rows.kanji.components, ...(rows.structure?.elementGlyphs ?? [])])
          ].filter(glyph => this.kanjiData.has(glyph))
        }
      : null
    this.kanjiPages.set(character, response)
    return response
  }

  /** The word sitemaps: every word page, in entry-number order, 50,000 to a file. */
  wordSitemaps(): WordSitemap[] {
    if (!this.sitemaps) {
      const numbers = this.db
        .all<{ ent_seq: number }>(
          `SELECT source_record_id AS ent_seq FROM entries WHERE source_identity = ?
           ORDER BY source_record_id`,
          [jmdictSource]
        )
        .map(row => row.ent_seq)
      const sitemaps: WordSitemap[] = []
      for (let start = 0; start < numbers.length; start += sitemapUrlLimit) {
        const chunk = numbers.slice(start, start + sitemapUrlLimit)
        sitemaps.push({
          number: sitemaps.length + 1,
          firstEntSeq: chunk[0],
          lastEntSeq: chunk[chunk.length - 1],
          urlCount: chunk.length
        })
      }
      this.sitemaps = sitemaps
    }
    return this.sitemaps
  }

  /** Up to `limit` of a sitemap's words after entry number `after`, with each page's slug. */
  sitemapWords(
    sitemap: WordSitemap,
    after: number,
    limit: number
  ): { entSeq: number; slug: string }[] {
    const rows = this.db.all<{ ent_seq: number; headword: string; reading: string }>(
      `SELECT source_record_id AS ent_seq, headword, reading FROM entries
       WHERE source_identity = ? AND source_record_id > ? AND source_record_id <= ?
       ORDER BY source_record_id LIMIT ?`,
      [jmdictSource, Math.max(after, sitemap.firstEntSeq - 1), sitemap.lastEntSeq, limit]
    )
    return rows.map(row => ({
      entSeq: row.ent_seq,
      slug: wordSlug(row.headword, row.reading)
    }))
  }

  /**
   * Retired word pages (ADR 0007): each JMdict number a previous release published and this one
   * doesn't, with the number that replaces it or null. None until the artifact records retired
   * entries (#463).
   */
  retired(): Record<number, number | null> {
    return {}
  }

  /** Every kanji search engines may index, in code point order. */
  indexableKanji(): string[] {
    return this.kanjiData.indexableCharacters()
  }
}
