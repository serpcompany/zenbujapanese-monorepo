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

export type Slugs = Record<number, string>

export interface SearchResponse {
  screen: SearchResultsScreen
  kanjiHasPage: boolean
}

export interface WordResponse {
  rows: WordRows
  slug: string
  slugs: Slugs
  kanjiPages: string[]
}

export interface ExamplesResponse {
  rows: WordExampleRows[]
  slugs: Slugs
}

export interface ConjugationWordResponse {
  rows: WordRows
  slug: string
}

export interface FormExamplesResponse {
  rows: FormExampleRows[]
  listed: number
  slugs: Slugs
}

export interface SearchExamplesResponse extends ExamplesResponse {
  query: string
  listed: number
  truncated: boolean
  usesPrimaryEntryExamples: boolean
}

export interface KanjiResponse {
  rows: KanjiRows
  indexable: boolean
  slugs: Slugs
  kanjiPages: string[]
}

export interface WordSitemap {
  number: number
  firstEntSeq: number
  lastEntSeq: number
  urlCount: number
}

export interface DictionaryCapabilities {
  tokenize: Tokenize
  morphology?: MorphologyAnalyzer
}

export interface DictionaryOptions {
  db: ArtifactDatabase
  kanji: KanjiData
  capabilities: DictionaryCapabilities
  cacheSize?: number
}

const fts4QueryParserErrors = /malformed MATCH|unterminated string/i

export function isUnreadableQuery(error: unknown): boolean {
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    if (fts4QueryParserErrors.test(cause.message)) return true
  }
  return false
}

interface QueryExamples {
  primary: ExamplesEntry | null
  usesPrimaryEntryExamples: boolean
  examples: EntryExamples | null
}

export const sitemapUrlLimit = 50_000

export const maximumQueryLength = 200

export const isReadableLength = (text: string) => Array.from(text).length <= maximumQueryLength

export const maximumEntSeq = 99_999_999

const defaultCacheSize = 2_000

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
    const size = options.cacheSize ?? defaultCacheSize
    const sentenceListCacheSize = Math.max(1, Math.floor(size / 4))
    this.db = options.db
    this.kanjiData = options.kanji
    this.capabilities = options.capabilities
    this.searchCore = new DictionarySearch(searchDatabase(options.db), {
      morphology: options.capabilities.morphology
    })
    this.features = this.searchCore.features
    this.lookup = formLookup(options.db, new LruCache<string, LinkEntry[]>(size * 20))
    this.searches = new LruCache(size)
    this.queryExamples = new LruCache(sentenceListCacheSize)
    this.forms = new LruCache(sentenceListCacheSize)
    this.retrieved = new LruCache(size)
    this.kanjiPages = new LruCache(size)
  }

  private get linking() {
    return { tokenize: this.capabilities.tokenize, lookup: this.lookup }
  }

  searchResults(rawQuery: string): Promise<SearchResults> {
    return this.searchCore.search(normalizeQuery(rawQuery))
  }

  private async readableResults(query: string): Promise<SearchResults> {
    try {
      return await this.searchCore.search(query)
    } catch (error) {
      if (!isUnreadableQuery(error)) throw error
      return this.searchCore.search('')
    }
  }

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

  private entryExamples(entry: ExamplesEntry): EntryExamples | null {
    const cached = this.retrieved.get(entry.id)
    if (cached !== undefined) return cached
    const found = retrieveEntryExamples(this.db, entry)
    const examples = typeof found === 'string' ? null : found
    this.retrieved.set(entry.id, examples)
    return examples
  }

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

  formExamples(form: string, from = 0, limit = examplesPerPage): FormExamplesResponse {
    const sentences = this.formSentences(form)
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

  retired(): Record<number, number | null> {
    return {}
  }

  indexableKanji(): string[] {
    return this.kanjiData.indexableCharacters()
  }
}
