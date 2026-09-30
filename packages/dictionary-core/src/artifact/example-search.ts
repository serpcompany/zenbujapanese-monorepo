// The app's example search for a typed query (ADR 0009): ExampleSentenceData.retrieveEnglish and
// retrieveJapanese in apps/ios/Modules/Sources/SearchExperience/ExampleSentenceClient.swift, with
// its queries on the artifact's FTS4 indexes. An English query matches every Tatoeba pair by its
// English phrase (Porter-stemmed, and shown only when some pair holds the exact phrase); anything
// else matches pairs whose Japanese contains it. Search results offer them as "View N Example
// Sentences", and /dictionary/search/<query>/examples/ lists them.
// Change the Swift and this port in the same PR; the Search parity workflow checks it.

import { graphemeCount, graphemes } from '../detail/text'
import { exampleLimit } from '../examples/retrieval'
import { isASCII, normalizeQuery } from '../search/query'
import type { ArtifactDatabase } from './database'
import type { EntryExamples, ExampleSentence } from './example-retrieval'

/** ExampleSentenceLexicalRelation, for the relations a typed query's examples use. */
const Relation = {
  exactSurfacePhrase: 0,
  porterEquivalentPhrase: 1,
  entireJapaneseSentence: 2,
  containedJapaneseSurface: 3
} as const

/** Why the app's search throws for a query, so Search shows no examples. */
export type ExampleSearchError = 'empty' | 'embeddedQuote' | 'noPorterTerms'

const porterTable = 'example_sentence_english_porter_fts'
const exactTable = 'example_sentence_english_exact_fts'
const mapTable = 'example_sentence_fts_map'
const probeTable = 'temp.example_sentence_porter_query_probe'

/** The metadata the app's validateEnglishIndex requires of the bundled index. */
export const exampleIndexMetadata: Readonly<Record<string, string>> = {
  retrieval_index_schema_version: 'zenbu.example-sentence-retrieval-index.v2',
  retrieval_policy_version: 'ExampleSentenceRetrievalPolicy/v1',
  retrieval_porter_tokenizer: 'fts4/porter',
  retrieval_exact_tokenizer: 'fts4/simple',
  retrieval_pair_id_scheme: 'esp1-sha256-128-nfc-length-prefixed'
}

interface Match {
  sentence: ExampleSentence
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

function result(matches: Match[]): EntryExamples {
  const sorted = matches.sort(compareMatches)
  return {
    sentences: sorted.slice(0, exampleLimit).map(match => match.sentence),
    count: sorted.length > 50 ? 51 : sorted.length,
    truncated: sorted.length > exampleLimit
  }
}

// UTF-8 offsets, which FTS4's offsets() reports, as UTF-16 indexes into the same text.

/** Each UTF-8 byte offset that starts a code point, mapped to its UTF-16 index. */
function utf8Boundaries(text: string): Map<number, number> {
  const boundaries = new Map<number, number>()
  let bytes = 0
  let index = 0
  for (const character of text) {
    boundaries.set(bytes, index)
    const code = character.codePointAt(0) ?? 0
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
    index += character.length
  }
  boundaries.set(bytes, index)
  return boundaries
}

/** The UTF-16 index of each grapheme cluster's start, and the text's end. */
function graphemeStarts(text: string): Map<number, number> {
  const starts = new Map<number, number>()
  let index = 0
  for (const [position, cluster] of graphemes(text).entries()) {
    starts.set(index, position)
    index += cluster.length
  }
  starts.set(index, starts.size)
  return starts
}

/**
 * A text's UTF-8 offsets as UTF-16 indexes, and those as grapheme positions; undefined for an
 * offset inside a character or cluster. In printable ASCII, all three are the same.
 */
interface TextOffsets {
  utf16(byteOffset: number): number | undefined
  grapheme(index: number): number | undefined
}

function textOffsets(text: string): TextOffsets {
  if (/^[\x20-\x7e]*$/.test(text)) {
    const within = (offset: number) =>
      Number.isInteger(offset) && offset >= 0 && offset <= text.length ? offset : undefined
    return { utf16: within, grapheme: within }
  }
  const boundaries = utf8Boundaries(text)
  const starts = graphemeStarts(text)
  return { utf16: offset => boundaries.get(offset), grapheme: index => starts.get(index) }
}

interface FtsOffset {
  term: number
  byteOffset: number
  byteLength: number
}

/** offsets()'s value: four numbers per match, of which the term, byte offset, and byte length. */
function parseOffsets(raw: string): FtsOffset[] | null {
  const values = raw.split(' ').filter(Boolean).map(Number)
  if (values.length % 4 !== 0 || values.some(Number.isNaN)) return null
  const offsets: FtsOffset[] = []
  for (let index = 0; index < values.length; index += 4) {
    offsets.push({
      term: values[index + 1],
      byteOffset: values[index + 2],
      byteLength: values[index + 3]
    })
  }
  return offsets
}

/**
 * `phraseRange(in:offsets:)`: the first place the phrase's terms occur in order, without
 * crossing the end of a sentence, as a grapheme location and length; null when there's none.
 */
function phraseRange(
  text: string,
  offsets: FtsOffset[]
): { location: number; length: number } | null {
  if (offsets.length === 0) return null
  const termCount = Math.max(...offsets.map(offset => offset.term)) + 1
  const ordered = [...offsets].sort((left, right) =>
    left.byteOffset === right.byteOffset
      ? left.term - right.term
      : left.byteOffset - right.byteOffset
  )
  const offsetsOf = textOffsets(text)
  const slice = (from: number, to: number): string | null => {
    const start = offsetsOf.utf16(from)
    const end = offsetsOf.utf16(to)
    return start === undefined || end === undefined || start > end ? null : text.slice(start, end)
  }
  for (let start = 0; start < ordered.length; start++) {
    if (ordered[start].term !== 0 || start + termCount > ordered.length) continue
    const phrase = ordered.slice(start, start + termCount)
    if (!phrase.every((offset, index) => offset.term === index)) continue
    let crossesSentence = false
    for (let index = 0; index + 1 < phrase.length; index++) {
      const gap = slice(
        phrase[index].byteOffset + phrase[index].byteLength,
        phrase[index + 1].byteOffset
      )
      if (gap === null || /[.?!]\s/u.test(gap)) {
        crossesSentence = true
        break
      }
    }
    if (crossesSentence) continue
    const last = phrase[phrase.length - 1]
    const from = offsetsOf.utf16(phrase[0].byteOffset)
    const to = offsetsOf.utf16(last.byteOffset + last.byteLength)
    const location = from === undefined ? undefined : offsetsOf.grapheme(from)
    const end = to === undefined ? undefined : offsetsOf.grapheme(to)
    if (location === undefined || end === undefined || end < location) continue
    return { location, length: end - location }
  }
  return null
}

/** `porterEmitsTerms`: whether the Porter tokenizer finds any term in the query. */
function porterEmitsTerms(db: ArtifactDatabase, query: string, matchExpression: string): boolean {
  db.all(`CREATE VIRTUAL TABLE IF NOT EXISTS ${probeTable} USING fts4(value, tokenize=porter)`)
  db.all(`DELETE FROM ${probeTable}`)
  db.all(`INSERT INTO ${probeTable}(value) VALUES (?)`, [query])
  const [row] = db.all<{ count: number }>(
    `SELECT count(*) AS count FROM ${probeTable} WHERE example_sentence_porter_query_probe MATCH ?`,
    [matchExpression]
  )
  return row?.count === 1
}

/** matchinfo(…, 'l')'s first value: the column's length in terms, a native 32-bit integer. */
function documentTermCount(matchinfo: Uint8Array): number {
  if (matchinfo.byteLength < 4) throw new Error('matchinfo returned no column length')
  return new DataView(matchinfo.buffer, matchinfo.byteOffset, 4).getUint32(0, true)
}

const sentenceColumns = 'e.rowid AS rowid, lower(hex(e.id)) AS pairId, e.japanese, e.english'

/** Every Tatoeba pair the app searches, as the searches read them. */
export function allExampleSentences(db: ArtifactDatabase): ExampleSentence[] {
  return db.all<ExampleSentence>(`SELECT ${sentenceColumns} FROM example_sentences e`)
}

function retrieveEnglish(db: ArtifactDatabase, query: string): EntryExamples | ExampleSearchError {
  if (query.includes('"')) return 'embeddedQuote'
  const matchExpression = `"${query}"`
  if (!porterEmitsTerms(db, query, matchExpression)) return 'noPorterTerms'

  const exactRanges = new Map<string, { location: number; length: number }>()
  for (const row of db.all<{ pairId: string; english: string; offsets: string }>(
    `SELECT lower(hex(m.pair_id)) AS pairId, e.english, offsets(${exactTable}) AS offsets
     FROM ${exactTable} x
     JOIN ${mapTable} m ON m.fts_rowid = x.docid
     JOIN example_sentences e ON e.id = m.pair_id
     WHERE ${exactTable} MATCH ?`,
    [matchExpression]
  )) {
    const offsets = parseOffsets(row.offsets)
    const range = offsets && phraseRange(row.english, offsets)
    if (range) exactRanges.set(row.pairId, range)
  }

  const matches = new Map<string, Match & { exactSurface: boolean }>()
  for (const { offsets: rawOffsets, matchinfo, ...sentence } of db.all<
    ExampleSentence & { offsets: string; matchinfo: Uint8Array }
  >(
    `SELECT ${sentenceColumns}, offsets(${porterTable}) AS offsets,
       matchinfo(${porterTable}, 'l') AS matchinfo
     FROM ${porterTable} p
     JOIN ${mapTable} m ON m.fts_rowid = p.docid
     JOIN example_sentences e ON e.id = m.pair_id
     WHERE ${porterTable} MATCH ?`,
    [matchExpression]
  )) {
    if (matches.has(sentence.pairId)) throw new Error('The example index lists a pair twice')
    const offsets = parseOffsets(rawOffsets)
    const porterRange = offsets && phraseRange(sentence.english, offsets)
    if (!porterRange) continue
    const exactRange = exactRanges.get(sentence.pairId)
    const range = exactRange ?? porterRange
    matches.set(sentence.pairId, {
      sentence,
      relation: exactRange ? Relation.exactSurfacePhrase : Relation.porterEquivalentPhrase,
      position: range.location,
      englishTermCount: documentTermCount(matchinfo),
      graphemeCount: graphemeCount(sentence.japanese),
      pairId: sentence.pairId,
      exactSurface: exactRange !== undefined
    })
  }
  const candidates = [...matches.values()]
  // The app shows Porter-equivalent pairs only when some pair has the exact phrase.
  return candidates.some(candidate => candidate.exactSurface) ? result(candidates) : result([])
}

function retrieveJapanese(db: ArtifactDatabase, query: string): EntryExamples {
  return rankJapanese(
    query,
    db.all<ExampleSentence>(
      `SELECT ${sentenceColumns} FROM example_sentences e WHERE instr(e.japanese, ?) > 0`,
      [query]
    )
  )
}

/**
 * `retrieveJapanese`'s ranking of the sentences that contain `query`: a sentence that is exactly
 * the query first, then each by where it first occurs, the sentence's length, and its pair ID; at
 * most 100. Sentences that don't contain it are left out.
 */
export function rankJapanese(query: string, sentences: readonly ExampleSentence[]): EntryExamples {
  const matches: Match[] = []
  for (const sentence of sentences) {
    const index = sentence.japanese.indexOf(query)
    if (index < 0) continue
    matches.push({
      sentence,
      relation:
        sentence.japanese === query
          ? Relation.entireJapaneseSentence
          : Relation.containedJapaneseSurface,
      position: graphemeCount(sentence.japanese.slice(0, index)),
      englishTermCount: 0,
      graphemeCount: graphemeCount(sentence.japanese),
      pairId: sentence.pairId
    })
  }
  return result(matches)
}

/**
 * `ExampleSentenceClient.search`: the pairs a typed query matches, at most 100, in the app's
 * order, with the count the app reports (`count(_:)`); an error where the app throws, so Search
 * shows no examples.
 */
export function searchExamples(
  db: ArtifactDatabase,
  rawQuery: string
): EntryExamples | ExampleSearchError {
  const query = normalizeQuery(rawQuery)
  if (query === '') return 'empty'
  return isASCII(query) ? retrieveEnglish(db, query) : retrieveJapanese(db, query)
}
