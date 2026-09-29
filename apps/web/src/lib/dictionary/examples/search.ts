// Ports the app's example search (ExampleSentenceData.retrieveEnglish and retrieveJapanese in
// apps/ios/Modules/Sources/SearchExperience/ExampleSentenceClient.swift): the sentences Search's
// "View N Example Sentences" row counts and its Example Sentences screen lists for a query, in
// the app's order, at most 100. An ASCII query matches the English side as an FTS4 Porter phrase,
// and only when some sentence has the exact words (./fts4.ts ports FTS4); any other query matches
// the Japanese side as a substring. Each sentence ranks by how it matched, where, the English
// sentence's length in words, the Japanese sentence's length, and its pair ID.
//
// Where the sentences come from is the caller's: an `ExampleSearchSource` returns every sentence
// that might match (a superset), and this keeps only what the app keeps. The website reads them
// from the search database's full-text indexes (search-db.ts); the import, which precomputes broad
// queries, from memory. Change the Swift and this port in the same PR, and record the
// example-search suite again.

import { normalizeQuery } from '../search/query'
import {
  type Fts4QueryToken,
  type Fts4Token,
  phraseOffsets,
  phraseQuery,
  phraseRange,
  tokenize
} from './fts4'
import { exampleLimit, graphemePosition } from './retrieval'

/** A sentence a search may list. */
export interface SearchSentence {
  /** The search database's number for the sentence. */
  id: number
  /** The pair ID's 16 bytes as lowercase hex. */
  pairId: string
  japanese: string
  english: string
}

/** Where the candidate sentences come from. Each may return more than matches, never fewer. */
export interface ExampleSearchSource {
  /** Every sentence whose English may hold the Porter phrase. */
  english(phrase: Fts4QueryToken[]): Promise<SearchSentence[]>
  /** Every sentence whose Japanese may contain the text. */
  japanese(text: string): Promise<SearchSentence[]>
}

/** What the app's retrieval returns: `ExampleSentenceRetrievalResult`. */
export interface ExampleSearchResult {
  /** The listed sentences' numbers, in the app's order, at most 100. */
  ids: number[]
  /** `ExampleSentenceResultCount.compatibilityValue`: exact up to 50; 51 means more than 50. */
  count: number
  /** Whether more than 100 matched, so some aren't listed. */
  truncated: boolean
}

/** A search the app refuses (`invalidQuery`), which lists nothing and counts 0. */
export const noExamples: ExampleSearchResult = { ids: [], count: 0, truncated: false }

/** `ExampleSentenceLexicalRelation` for direct searches. */
export const SearchRelation = {
  exactSurfacePhrase: 0,
  porterEquivalentPhrase: 1,
  entireJapaneseSentence: 2,
  containedJapaneseSurface: 3
} as const

interface Match {
  id: number
  relation: number
  position: number
  englishTermCount: number
  graphemeCount: number
  pairId: string
}

/** RankTuple's order. */
function compareMatches(left: Match, right: Match): number {
  return (
    left.relation - right.relation ||
    left.position - right.position ||
    left.englishTermCount - right.englishTermCount ||
    left.graphemeCount - right.graphemeCount ||
    (left.pairId < right.pairId ? -1 : left.pairId > right.pairId ? 1 : 0)
  )
}

/** `result(matches:)`. */
function result(matches: Match[]): ExampleSearchResult {
  matches.sort(compareMatches)
  return {
    ids: matches.slice(0, exampleLimit).map(match => match.id),
    count: matches.length > 50 ? 51 : matches.length,
    truncated: matches.length > exampleLimit
  }
}

/** A sentence's English words as FTS4's two tokenizers find them. */
export interface EnglishTokens {
  porter: Fts4Token[]
  simple: Fts4Token[]
}

// Kept while the sentence object lives, so the import, which searches the same sentences many
// times, tokenizes each once.
const tokenCache = new WeakMap<SearchSentence, EnglishTokens>()
const graphemeCache = new WeakMap<SearchSentence, number>()

export function englishTokens(sentence: SearchSentence): EnglishTokens {
  let tokens = tokenCache.get(sentence)
  if (!tokens) {
    tokens = {
      porter: tokenize(sentence.english, 'porter'),
      simple: tokenize(sentence.english, 'simple')
    }
    tokenCache.set(sentence, tokens)
  }
  return tokens
}

const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' })

/** `japanese.count`: the Japanese sentence's length in grapheme clusters. */
function graphemeCount(sentence: SearchSentence): number {
  let count = graphemeCache.get(sentence)
  if (count === undefined) {
    count = 0
    for (const _ of segmenter.segment(sentence.japanese)) count++
    graphemeCache.set(sentence, count)
  }
  return count
}

/** `SearchQuery.isASCII`. */
const isASCII = (value: string) => [...value].every(character => character.charCodeAt(0) < 0x80)

/**
 * The search an English query runs, or null when the app refuses it: the Porter phrase that finds
 * candidates, and the exact phrase (the `simple` tokenizer) one of them must also match.
 */
export function englishPhrases(
  query: string
): { porter: Fts4QueryToken[]; exact: Fts4QueryToken[] } | null {
  if (query === '' || !isASCII(query) || query.includes('"')) return null
  const porter = phraseQuery(query, 'porter')
  // porterEmitsTerms: the query, stored as a sentence, must match itself.
  if (phraseOffsets(porter, tokenize(query, 'porter')).length === 0) return null
  return { porter, exact: phraseQuery(query, 'simple') }
}

/** `retrieveEnglish`, over the source's candidates. */
async function searchEnglish(
  query: string,
  source: ExampleSearchSource
): Promise<ExampleSearchResult> {
  const phrases = englishPhrases(query)
  if (!phrases) return noExamples
  const matches: Match[] = []
  let anyExact = false
  for (const sentence of await source.english(phrases.porter)) {
    const tokens = englishTokens(sentence)
    const porterRange = phraseRange(sentence.english, phraseOffsets(phrases.porter, tokens.porter))
    if (!porterRange) continue
    const exactRange = phraseRange(sentence.english, phraseOffsets(phrases.exact, tokens.simple))
    if (exactRange) anyExact = true
    matches.push({
      id: sentence.id,
      relation: exactRange
        ? SearchRelation.exactSurfacePhrase
        : SearchRelation.porterEquivalentPhrase,
      position: (exactRange ?? porterRange).location,
      englishTermCount: tokens.porter.length,
      graphemeCount: graphemeCount(sentence),
      pairId: sentence.pairId
    })
  }
  // Only a search whose exact words occur somewhere lists anything.
  return anyExact ? result(matches) : noExamples
}

/** `retrieveJapanese`, over the source's candidates. */
async function searchJapanese(
  query: string,
  source: ExampleSearchSource
): Promise<ExampleSearchResult> {
  if (query === '' || isASCII(query)) return noExamples
  const matches: Match[] = []
  for (const sentence of await source.japanese(query)) {
    const position = graphemePosition(query, sentence.japanese)
    if (position === null) continue
    matches.push({
      id: sentence.id,
      relation:
        sentence.japanese === query
          ? SearchRelation.entireJapaneseSentence
          : SearchRelation.containedJapaneseSurface,
      position,
      englishTermCount: 0,
      graphemeCount: graphemeCount(sentence),
      pairId: sentence.pairId
    })
  }
  return result(matches)
}

/**
 * `ExampleSentenceClient.search` and `count`: the sentences that contain the query, English for
 * an ASCII query and Japanese otherwise.
 */
export function searchExamples(
  rawQuery: string,
  source: ExampleSearchSource
): Promise<ExampleSearchResult> {
  const query = normalizeQuery(rawQuery)
  return isASCII(query) ? searchEnglish(query, source) : searchJapanese(query, source)
}

/**
 * How many candidate sentences the website reads for a search per request. The import
 * precomputes every search with more that can list anything (example_search_cache).
 */
export const exampleCandidateLimit = 1_000

/**
 * A sentence's Porter terms as `example_english_fts` indexes them: each term's bytes in hex
 * after an `x`, so FTS5's `ascii` tokenizer keeps every term whole (FTS4 cuts long words
 * mid-character) and a prefix of a term is a prefix of its hex.
 */
export function stemsDocument(tokens: readonly { term: string }[]): string {
  return tokens.map(token => hexTerm(token.term)).join(' ')
}

const hexTerm = (term: string) =>
  `x${Array.from(term, character => character.charCodeAt(0).toString(16).padStart(2, '0')).join('')}`

/**
 * The FTS5 query that finds at least every sentence an FTS4 Porter phrase matches in
 * `example_english_fts`: the phrase itself, or, with a prefix before its last term, every term.
 * First-token marks (`^`) aren't enforced here; the search checks them.
 */
export function englishFtsQuery(phrase: Fts4QueryToken[]): string {
  const prefixBeforeLast = phrase.slice(0, -1).some(token => token.isPrefix)
  if (prefixBeforeLast) {
    return phrase.map(token => `"${hexTerm(token.term)}"${token.isPrefix ? '*' : ''}`).join(' AND ')
  }
  const last = phrase[phrase.length - 1]
  return `"${phrase.map(token => hexTerm(token.term)).join(' ')}"${last?.isPrefix ? '*' : ''}`
}

/**
 * The characters `example_japanese_chars` indexes: letters, marks, numbers, punctuation,
 * symbols, and private use. The import checks that sentences hold no others but spaces.
 */
export function japaneseCharacters(text: string): string[] {
  return Array.from(text).filter(character => /[\p{L}\p{M}\p{N}\p{P}\p{S}\p{Co}]/u.test(character))
}

/**
 * Whether an English query can list anything only when the import precomputed it, once it has
 * more than `exampleCandidateLimit` candidates: a query of plain words, whose Porter terms are its
 * exact words' stems. A prefix (`*`), a first-word mark (`^`), an underscore (a Porter word
 * character, but a delimiter for exact words), or a NUL breaks that.
 */
export function isPlainEnglishQuery(query: string): boolean {
  return !/[*^_\0]/.test(query)
}

/**
 * The key a search is precomputed under. An English query's results depend only on its phrases,
 * so queries that tokenize alike (`i'm`, `i m`) share one; any other query is its own key.
 */
export function exampleSearchKey(rawQuery: string): string {
  const query = normalizeQuery(rawQuery)
  if (!isASCII(query)) return query
  const phrases = englishPhrases(query)
  if (!phrases) return query
  const words = (tokens: Fts4QueryToken[]) =>
    tokens.map(token => `${token.isFirst ? '^' : ''}${token.term}${token.isPrefix ? '*' : ''}`)
  return `english:${JSON.stringify([words(phrases.porter), words(phrases.exact)])}`
}
