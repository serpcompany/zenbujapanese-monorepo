import { graphemeCount, graphemes } from '../detail/text'
import { exampleLimit, reportedExampleCount } from '../examples/retrieval'
import { isASCII, normalizeQuery } from '../search/query'
import type { ArtifactDatabase } from './database'
import type { EntryExamples, ExampleSentence } from './example-retrieval'

const Relation = {
  exactSurfacePhrase: 0,
  porterEquivalentPhrase: 1,
  entireJapaneseSentence: 2,
  containedJapaneseSurface: 3
} as const

export type ExampleSearchError = 'empty' | 'embeddedQuote' | 'noPorterTerms'

const porterTable = 'example_sentence_english_porter_fts'
const exactTable = 'example_sentence_english_exact_fts'
const mapTable = 'example_sentence_fts_map'
const probeTable = 'temp.example_sentence_porter_query_probe'

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
    count: reportedExampleCount(sorted.length),
    truncated: sorted.length > exampleLimit
  }
}

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

const numbersPerOffset = 4

function parseOffsets(raw: string): FtsOffset[] | null {
  const values = raw.split(' ').filter(Boolean).map(Number)
  if (values.length % numbersPerOffset !== 0 || values.some(Number.isNaN)) return null
  const offsets: FtsOffset[] = []
  for (let index = 0; index < values.length; index += numbersPerOffset) {
    offsets.push({
      term: values[index + 1],
      byteOffset: values[index + 2],
      byteLength: values[index + 3]
    })
  }
  return offsets
}

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

function documentTermCount(matchinfo: Uint8Array): number {
  if (matchinfo.byteLength < 4) throw new Error('matchinfo returned no column length')
  return new DataView(matchinfo.buffer, matchinfo.byteOffset, 4).getUint32(0, true)
}

const sentenceColumns = 'e.rowid AS rowid, lower(hex(e.id)) AS pairId, e.japanese, e.english'

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
  const anyPairHasTheExactPhrase = candidates.some(candidate => candidate.exactSurface)
  return anyPairHasTheExactPhrase ? result(candidates) : result([])
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

export function searchExamples(
  db: ArtifactDatabase,
  rawQuery: string
): EntryExamples | ExampleSearchError {
  const query = normalizeQuery(rawQuery)
  if (query === '') return 'empty'
  return isASCII(query) ? retrieveEnglish(db, query) : retrieveJapanese(db, query)
}
