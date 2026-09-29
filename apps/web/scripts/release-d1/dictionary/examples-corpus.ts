// The artifact's example sentences and forms, read once into memory for the example precompute
// (build-examples.mts): the corpus retrieval.ts ranks, and the exact-form lookup linking.ts
// resolves words with.

import { DatabaseSync } from 'node:sqlite'
import { graphemes } from '../../../src/lib/dictionary/detail/text'
import type { LinkEntry } from '../../../src/lib/dictionary/examples/linking'
import type {
  CorpusSentence,
  EntryEvidence,
  ExampleCorpus,
  TermOccurrences
} from '../../../src/lib/dictionary/examples/retrieval'
import { isASCII, normalizeQuery } from '../../../src/lib/dictionary/search/query'
import { type JapaneseRow, rankJapanese } from '../../../src/lib/dictionary/search/search'

/** ExampleSentenceData.wordIndexSchema: the ExampleWordIndex the app reads. */
export const wordIndexSchema = 'zenbu.example-word-index.v1'

export interface Sentence extends CorpusSentence {
  english: string
  japaneseTatoebaId: number
  japaneseContributor: string | null
  japaneseLicense: string
  englishTatoebaId: number
  englishContributor: string | null
  englishLicense: string
}

export interface Entry {
  id: string
  entSeq: number
  headword: string
  reading: string
  writtenForms: string[]
  readingForms: string[]
  partsOfSpeech: string[]
  fingerprint: string
}

const WRITTEN = 0
const READING = 1

/** A contributor Tatoeba names; null when the export has none. */
const contributor = (name: string | null, status: string) =>
  status === 'named' && name ? name : null

export function openArtifact(source: string, wordIndex: string): DatabaseSync {
  const db = new DatabaseSync(source, { readOnly: true })
  db.exec(`ATTACH DATABASE 'file:${wordIndex.replaceAll("'", "''")}?mode=ro' AS word_index`)
  const schema = db
    .prepare("SELECT value FROM word_index.metadata WHERE key = 'artifact_schema'")
    .get() as { value: string } | undefined
  if (schema?.value !== wordIndexSchema) {
    throw new Error(`ExampleWordIndex is ${schema?.value}; the app reads ${wordIndexSchema}`)
  }
  return db
}

export function readSentences(db: DatabaseSync): Sentence[] {
  const rows = db
    .prepare(
      `SELECT lower(hex(e.id)) AS pair_id, e.japanese, e.english,
         p.source_japanese_record_id, p.japanese_contributor, p.japanese_contributor_status,
         p.japanese_license, p.source_english_record_id, p.english_contributor,
         p.english_contributor_status, p.english_license
       FROM example_sentences e JOIN example_sentence_provenance p ON p.pair_id = e.id
       ORDER BY e.id`
    )
    .all() as Record<string, string | number | null>[]
  const sentences = rows.map(row => {
    const japanese = row.japanese as string
    return {
      pairId: row.pair_id as string,
      japanese,
      english: row.english as string,
      graphemeCount: graphemes(japanese).length,
      japaneseTatoebaId: row.source_japanese_record_id as number,
      japaneseContributor: contributor(
        row.japanese_contributor as string | null,
        row.japanese_contributor_status as string
      ),
      japaneseLicense: row.japanese_license as string,
      englishTatoebaId: row.source_english_record_id as number,
      englishContributor: contributor(
        row.english_contributor as string | null,
        row.english_contributor_status as string
      ),
      englishLicense: row.english_license as string
    }
  })
  // The app's validateBaseCorpus: one provenance row per pair.
  const count = (db.prepare('SELECT count(*) AS n FROM example_sentences').get() as { n: number }).n
  if (sentences.length !== count) {
    throw new Error(`${count} example sentences, but ${sentences.length} with provenance`)
  }
  return sentences
}

export function readEntries(db: DatabaseSync): Entry[] {
  const rows = db
    .prepare(
      `SELECT lower(hex(id)) AS id, source_record_id, headword, reading, written_forms_json,
         reading_forms_json, parts_of_speech_json, lower(hex(semantic_fingerprint)) AS fingerprint
       FROM entries ORDER BY source_record_id`
    )
    .all() as Record<string, string | number>[]
  const values = (json: string) => (JSON.parse(json) as { value: string }[]).map(form => form.value)
  return rows.map(row => ({
    id: row.id as string,
    entSeq: row.source_record_id as number,
    headword: row.headword as string,
    reading: row.reading as string,
    writtenForms: values(row.written_forms_json as string),
    readingForms: values(row.reading_forms_json as string),
    partsOfSpeech: JSON.parse(row.parts_of_speech_json as string),
    fingerprint: row.fingerprint as string
  }))
}

/**
 * Each entry as the app opens it: `LookupClient.entry(_:)` shows the entry of its equivalence
 * group (entries with its semantic fingerprint) with the lowest ID.
 */
export function canonicalEntries(entries: Entry[]): Map<number, Entry> {
  const lowest = new Map<string, Entry>()
  for (const entry of entries) {
    const current = lowest.get(entry.fingerprint)
    if (!current || entry.id < current.id) lowest.set(entry.fingerprint, entry)
  }
  return new Map(entries.map(entry => [entry.entSeq, lowest.get(entry.fingerprint) as Entry]))
}

export interface Forms {
  evidence(id: string): EntryEvidence | null
  unambiguousEntryCount(selectedForm: string, reading: string): number
}

/** `entryEvidence(id:)` and `unambiguousEntryCount`, over every written and reading form. */
export function readForms(db: DatabaseSync, entries: Entry[]): Forms {
  const evidence = new Map<string, EntryEvidence>()
  const byWrittenForm = new Map<string, string[]>()
  const reading = new Map(entries.map(entry => [entry.id, entry.reading]))
  const rows = db
    .prepare(
      'SELECT lower(hex(entry_id)) AS id, form, kind FROM forms WHERE kind IN (?, ?) ORDER BY rowid'
    )
    .all(WRITTEN, READING) as { id: string; form: string; kind: number }[]
  for (const { id, form, kind } of rows) {
    let forms = evidence.get(id)
    if (!forms) {
      forms = { reading: reading.get(id) ?? '', writtenForms: new Set(), readingForms: new Set() }
      evidence.set(id, forms)
    }
    if (kind === WRITTEN) {
      forms.writtenForms.add(form)
      const ids = byWrittenForm.get(form)
      if (ids) ids.push(id)
      else byWrittenForm.set(form, [id])
    } else {
      forms.readingForms.add(form)
    }
  }
  return {
    evidence: id => evidence.get(id) ?? null,
    unambiguousEntryCount(selectedForm, readingForm) {
      const ids = new Set(
        (byWrittenForm.get(selectedForm) ?? []).filter(id =>
          evidence.get(id)?.readingForms.has(readingForm)
        )
      )
      return ids.size
    }
  }
}

/** ExampleWordIndex's sentences for each entry, by Language Reference ID. */
export function readWordIndex(
  db: DatabaseSync,
  sentences: CorpusSentence[]
): Map<string, { sentence: number; surface: string }[]> {
  const byPairId = new Map(sentences.map((sentence, index) => [sentence.pairId, index]))
  const rows = db
    .prepare(
      `SELECT lower(hex(w.entry_id)) AS id, lower(hex(w.pair_id)) AS pair_id, w.surface
       FROM word_index.entry_sentences w`
    )
    .all() as { id: string; pair_id: string; surface: string }[]
  const index = new Map<string, { sentence: number; surface: string }[]>()
  for (const row of rows) {
    // The app joins the index to example_sentences, so a pair the corpus lacks drops out.
    const sentence = byPairId.get(row.pair_id)
    if (sentence === undefined) continue
    const list = index.get(row.id)
    if (list) list.push({ sentence, surface: row.surface })
    else index.set(row.id, [{ sentence, surface: row.surface }])
  }
  return index
}

export function corpus(
  sentences: CorpusSentence[],
  forms: Forms,
  occurrences: Map<string, TermOccurrences>,
  wordIndex: Map<string, { sentence: number; surface: string }[]>
): ExampleCorpus {
  return {
    sentences,
    evidence: forms.evidence,
    unambiguousEntryCount: forms.unambiguousEntryCount,
    occurrences(term) {
      const found = occurrences.get(term)
      if (!found) throw new Error(`No occurrences were collected for ${term}`)
      return found
    },
    indexedSentences: id => wordIndex.get(id) ?? []
  }
}

/**
 * `LookupClient.entriesMatchingForm`: `rankedJapanese(_, exactFormOnly: true)`, the app's exact
 * form query over the artifact, ranked and deduplicated by the search port (search.ts), cached
 * by form as the app's analyzer caches it. The entries are the deduplicated results: the leading
 * entry's reading and parts of speech, under its group's lowest ID.
 */
export function formLookup(db: DatabaseSync): {
  lookup: (form: string) => LinkEntry[]
  asciiForms: Set<string>
} {
  const statement = db.prepare(
    `SELECT lower(hex(e.id)) AS id, e.source_record_id, e.headword, e.reading, e.summary,
       e.parts_of_speech_json, lower(hex(e.semantic_fingerprint)) AS semantic_fingerprint,
       f.form, f.kind,
       (SELECT count(*) FROM canonical_senses s WHERE s.entry_id = e.id) AS sense_count,
       p.primary_mask, p.secondary_mask, p.news_frequency_band
     FROM forms f
     JOIN entries e ON e.id = f.entry_id
     LEFT JOIN form_priority_profiles p
       ON p.entry_id = f.entry_id AND p.form = f.form AND p.kind = f.kind
     WHERE f.kind IN (${WRITTEN}, ${READING})
       AND f.form = ?
       AND (
         f.kind != ${READING}
         OR NOT EXISTS (
           SELECT 1 FROM reading_form_restrictions r
           WHERE r.entry_id = f.entry_id AND r.reading = f.form
         )
         OR EXISTS (
           SELECT 1 FROM reading_form_restrictions r
           WHERE r.entry_id = f.entry_id AND r.reading = f.form
             AND r.written_form = e.headword
         )
       )`
  )
  const cache = new Map<string, LinkEntry[]>()
  const asciiForms = new Set<string>()
  return {
    asciiForms,
    lookup(form) {
      const cached = cache.get(form)
      if (cached) return cached
      const query = normalizeQuery(form)
      let entries: LinkEntry[] = []
      if (query !== '') {
        if (isASCII(query)) {
          // The app looks an ASCII form up in English; no example word needs it (the import
          // fails if one does, rather than linking it differently).
          asciiForms.add(form)
        } else {
          const rows = statement.all(query) as unknown as JapaneseRow[]
          entries = rankJapanese(query, rows).map(({ entry }) => ({
            id: entry.id,
            reading: entry.reading,
            partsOfSpeech: entry.partsOfSpeech
          }))
        }
      }
      cache.set(form, entries)
      return entries
    }
  }
}

interface FtsOffset {
  term: number
  byteOffset: number
  byteLength: number
}

/** FTS4 `offsets()`: column, term, byte offset, and byte length per match. */
function ftsOffsets(value: string): FtsOffset[] {
  const numbers = value.split(' ').map(Number)
  if (numbers.length % 4 !== 0) throw new Error(`Unreadable FTS offsets: ${value}`)
  const offsets: FtsOffset[] = []
  for (let index = 0; index < numbers.length; index += 4) {
    offsets.push({
      term: numbers[index + 1],
      byteOffset: numbers[index + 2],
      byteLength: numbers[index + 3]
    })
  }
  return offsets
}

/**
 * The grapheme index at each UTF-8 byte offset that starts a grapheme (and at the end), as
 * Swift's `String.Index(_:within:)` accepts only offsets on a Character boundary.
 */
function graphemeBoundaries(text: string): Map<number, number> {
  const boundaries = new Map<number, number>()
  let bytes = 0
  const clusters = graphemes(text)
  for (const [index, cluster] of clusters.entries()) {
    boundaries.set(bytes, index)
    bytes += Buffer.byteLength(cluster)
  }
  boundaries.set(bytes, clusters.length)
  return boundaries
}

/**
 * `phraseRange(in:offsets:)`: where the phrase first occurs with its terms in order and no
 * sentence-ending punctuation between them, in graphemes (its location); null when it doesn't.
 */
function phraseLocation(text: string, offsets: FtsOffset[]): number | null {
  if (offsets.length === 0) return null
  const termCount = Math.max(...offsets.map(offset => offset.term)) + 1
  const ordered = [...offsets].sort((a, b) => a.byteOffset - b.byteOffset || a.term - b.term)
  const bytes = Buffer.from(text)
  const boundaries = graphemeBoundaries(text)
  for (const [start, first] of ordered.entries()) {
    if (first.term !== 0 || start + termCount > ordered.length) continue
    const phrase = ordered.slice(start, start + termCount)
    if (phrase.some((offset, index) => offset.term !== index)) continue
    let crosses = false
    for (let index = 1; index < phrase.length; index++) {
      const from = phrase[index - 1].byteOffset + phrase[index - 1].byteLength
      const to = phrase[index].byteOffset
      if (!boundaries.has(from) || !boundaries.has(to) || to < from) {
        crosses = true
        break
      }
      if (/[.?!]\s/.test(bytes.subarray(from, to).toString())) {
        crosses = true
        break
      }
    }
    const last = phrase[phrase.length - 1]
    const location = boundaries.get(first.byteOffset)
    if (crosses || location === undefined || !boundaries.has(last.byteOffset + last.byteLength)) {
      continue
    }
    return location
  }
  return null
}

/**
 * `retrieveEnglish`: the sentences an English search lists (ExampleSentenceClient.search for an
 * ASCII query), from the artifact's FTS4 indexes, which only the import can read, in the app's
 * order, at most 100. A conjugated form whose spelling is ASCII once normalized, such as Ｈ,
 * searches this way. Every sentence Porter stemming matches as a phrase ranks: an exact phrase
 * first, then by where it occurs, the translation's length in terms, the sentence's length, and
 * its pair ID; nothing is listed unless one is exact.
 */
export function englishSearch(
  db: DatabaseSync,
  sentences: CorpusSentence[]
): (query: string) => number[] {
  const byPairId = new Map(sentences.map((sentence, index) => [sentence.pairId, index]))
  const probe = new DatabaseSync(':memory:')
  probe.exec('CREATE VIRTUAL TABLE probe USING fts4(value, tokenize=porter)')
  const porter = db.prepare(
    `SELECT lower(hex(e.id)) AS pair_id, e.english,
       offsets(example_sentence_english_porter_fts) AS offsets,
       matchinfo(example_sentence_english_porter_fts, 'l') AS lengths
     FROM example_sentence_english_porter_fts p
     JOIN example_sentence_fts_map m ON m.fts_rowid = p.docid
     JOIN example_sentences e ON e.id = m.pair_id
     WHERE example_sentence_english_porter_fts MATCH ?`
  )
  const exact = db.prepare(
    `SELECT lower(hex(m.pair_id)) AS pair_id, e.english,
       offsets(example_sentence_english_exact_fts) AS offsets
     FROM example_sentence_english_exact_fts x
     JOIN example_sentence_fts_map m ON m.fts_rowid = x.docid
     JOIN example_sentences e ON e.id = m.pair_id
     WHERE example_sentence_english_exact_fts MATCH ?`
  )
  return query => {
    // The app throws for these, and the screen lists nothing.
    if (query === '' || !isASCII(query) || query.includes('"')) return []
    const expression = `"${query}"`
    // `porterEmitsTerms`: the query must stem to terms that match itself.
    probe.exec('DELETE FROM probe')
    probe.prepare('INSERT INTO probe(value) VALUES (?)').run(query)
    const emitted = probe
      .prepare('SELECT count(*) AS n FROM probe WHERE probe MATCH ?')
      .get(expression) as { n: number }
    if (emitted.n !== 1) return []
    const exactLocations = new Map<string, number>()
    const exactRows = exact.all(expression) as {
      pair_id: string
      english: string
      offsets: string
    }[]
    for (const row of exactRows) {
      const location = phraseLocation(row.english, ftsOffsets(row.offsets))
      if (location !== null) exactLocations.set(row.pair_id, location)
    }
    const candidates: {
      sentence: number
      relation: number
      position: number
      terms: number
      graphemeCount: number
      pairId: string
    }[] = []
    const rows = porter.all(expression) as {
      pair_id: string
      english: string
      offsets: string
      lengths: Uint8Array
    }[]
    const seen = new Set<string>()
    for (const row of rows) {
      // A pair already listed that the index returns again makes the app's search throw
      // (`invalidIndexMetadata`), and the form's screen then lists nothing.
      if (seen.has(row.pair_id)) return []
      const porterLocation = phraseLocation(row.english, ftsOffsets(row.offsets))
      if (porterLocation === null) continue
      const sentence = byPairId.get(row.pair_id)
      if (sentence === undefined) throw new Error(`No sentence ${row.pair_id}`)
      const exactLocation = exactLocations.get(row.pair_id)
      candidates.push({
        sentence,
        // exactSurfacePhrase, then porterEquivalentPhrase.
        relation: exactLocation === undefined ? 1 : 0,
        position: exactLocation ?? porterLocation,
        terms: Buffer.from(row.lengths).readUInt32LE(0),
        graphemeCount: sentences[sentence].graphemeCount,
        pairId: row.pair_id
      })
      seen.add(row.pair_id)
    }
    if (!candidates.some(candidate => candidate.relation === 0)) return []
    candidates.sort(
      (a, b) =>
        a.relation - b.relation ||
        a.position - b.position ||
        a.terms - b.terms ||
        a.graphemeCount - b.graphemeCount ||
        (a.pairId < b.pairId ? -1 : a.pairId > b.pairId ? 1 : 0)
    )
    return candidates.slice(0, 100).map(candidate => candidate.sentence)
  }
}
