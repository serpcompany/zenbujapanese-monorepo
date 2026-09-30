// The app's example retrieval for a dictionary entry, on the artifact when a page asks for it
// (ADR 0009): ExampleSentenceData.retrieveEntry and retrieveIndexedEntry in
// apps/ios/Modules/Sources/SearchExperience/ExampleSentenceClient.swift, with its queries. Which
// Tatoeba sentences a word page lists, in which order, and the count the app reports.
// Change the Swift and this port in the same PR, and re-record the word-detail suite; the Search
// parity workflow checks that both change.

import { graphemeCount } from '../detail/text'
import {
  compareRanks,
  exampleLimit,
  graphemePosition,
  LexicalRelation,
  normalizedEntryEvidence,
  type RetrievalEntry,
  type RetrievalError
} from '../examples/retrieval'
import type { ArtifactDatabase } from './database'

/** A Tatoeba pair from `example_sentences`. */
export interface ExampleSentence {
  /** Its rowid: stable within one artifact. */
  rowid: number
  /** The pair ID's 16 bytes, lowercase hex. */
  pairId: string
  japanese: string
  english: string
}

export interface EntryExamples {
  /** At most 100, in the app's order. */
  sentences: ExampleSentence[]
  /** `ExampleSentenceResultCount`: the exact count up to 50; 51 means more than 50. */
  count: number
  /** Whether more than 100 matched, so some aren't listed. */
  truncated: boolean
}

interface Match {
  sentence: ExampleSentence
  relation: number
  position: number
  graphemeCount: number
  pairId: string
}

const sentenceColumns = 'e.rowid AS rowid, lower(hex(e.id)) AS pairId, e.japanese, e.english'

/** `result(matches:)`: the first 100, with the count the app reports. */
function result(matches: Match[]): EntryExamples {
  return {
    sentences: matches.slice(0, exampleLimit).map(match => match.sentence),
    count: matches.length > 50 ? 51 : matches.length,
    truncated: matches.length > exampleLimit
  }
}

/** `entryEvidence(id:)`: the entry's stored reading and written forms, or null without them. */
function entryEvidence(
  db: ArtifactDatabase,
  id: string
): { reading: string; writtenForms: Set<string> } | null {
  const rows = db.all<{ reading: string; form: string; kind: number }>(
    `SELECT e.reading, f.form, f.kind
     FROM entries e
     JOIN forms f ON f.entry_id = e.id
     WHERE e.id = unhex(?) AND f.kind IN (0, 1)
     ORDER BY f.kind, f.form`,
    [id]
  )
  const reading = rows.at(-1)?.reading
  const writtenForms = new Set(rows.filter(row => row.kind === 0).map(row => row.form))
  const readingForms = new Set(rows.filter(row => row.kind === 1).map(row => row.form))
  if (reading === undefined || !readingForms.has(reading)) return null
  return { reading, writtenForms }
}

/** `unambiguousEntryCount`: entries with this written form and this reading form. */
function unambiguousEntryCount(
  db: ArtifactDatabase,
  selectedForm: string,
  reading: string
): number {
  const [row] = db.all<{ count: number }>(
    `SELECT count(DISTINCT lower(hex(e.id))) AS count
     FROM entries e
     JOIN forms written ON written.entry_id = e.id AND written.kind = 0 AND written.form = ?
     JOIN forms spoken ON spoken.entry_id = e.id AND spoken.kind = 1 AND spoken.form = ?`,
    [selectedForm, reading]
  )
  return row?.count ?? 0
}

/** `retrieveIndexedEntry`: a kana headword's sentences from ExampleWordIndex. */
function retrieveIndexedEntry(
  db: ArtifactDatabase,
  id: string,
  selectedForm: string
): EntryExamples {
  const rows = db.all<ExampleSentence & { surface: string }>(
    `SELECT ${sentenceColumns}, w.surface
     FROM word_index.entry_sentences w
     JOIN example_sentences e ON e.id = w.pair_id
     WHERE w.entry_id = unhex(?)`,
    [id]
  )
  const matches: Match[] = []
  for (const { surface: rawSurface, ...sentence } of rows) {
    const surface = normalizedEntryEvidence(rawSurface)
    const position = graphemePosition(surface, sentence.japanese)
    if (position === null) continue
    matches.push({
      sentence,
      relation:
        surface === selectedForm ? LexicalRelation.selectedWrittenForm : LexicalRelation.reading,
      position,
      graphemeCount: graphemeCount(sentence.japanese),
      pairId: sentence.pairId
    })
  }
  return result(matches.sort(compareRanks))
}

/**
 * `retrieveEntry`: a written headword's sentences, those containing its selected form, then its
 * other written forms, then its reading, each tier by where the form first occurs;
 * `retrieveIndexedEntry` for a kana headword. An error where the app throws, so Word Detail shows
 * no examples.
 */
export function retrieveEntryExamples(
  db: ArtifactDatabase,
  entry: RetrievalEntry
): EntryExamples | RetrievalError {
  const selectedForm = normalizedEntryEvidence(entry.headword)
  const reading = normalizedEntryEvidence(entry.reading)
  if (entry.id === '' || selectedForm === '' || reading === '') return 'missingEntryEvidence'
  const evidence = entryEvidence(db, entry.id)
  if (!evidence || evidence.reading !== reading) return 'missingEntryEvidence'
  // A kana headword such as でも also occurs inside other words (いつでも, 何でも), so its
  // examples come from sentences Tatoeba's word index links to the entry.
  if (selectedForm === reading) return retrieveIndexedEntry(db, entry.id, selectedForm)
  if (!evidence.writtenForms.has(selectedForm)) return 'missingEntryEvidence'
  if (unambiguousEntryCount(db, selectedForm, reading) !== 1) return result([])

  const alternateForms = entry.writtenForms
    .map(normalizedEntryEvidence)
    .filter(form => form !== selectedForm && evidence.writtenForms.has(form))
  const terms = [selectedForm, ...[...new Set(alternateForms)].sort(), reading]
  const rows = db.all<ExampleSentence>(
    `SELECT ${sentenceColumns} FROM example_sentences e
     WHERE ${terms.map(() => 'instr(e.japanese, ?) > 0').join(' OR ')}`,
    terms
  )

  const byPair = new Map<string, Match>()
  for (const sentence of rows) {
    const evidenceMatches: { relation: number; position: number }[] = []
    const add = (term: string, relation: number) => {
      const position = graphemePosition(term, sentence.japanese)
      if (position !== null) evidenceMatches.push({ relation, position })
    }
    add(selectedForm, LexicalRelation.selectedWrittenForm)
    for (const form of alternateForms) add(form, LexicalRelation.alternateWrittenForm)
    add(reading, LexicalRelation.reading)
    const best = evidenceMatches.reduce<{ relation: number; position: number } | null>(
      (min, next) =>
        !min ||
        next.relation < min.relation ||
        (next.relation === min.relation && next.position < min.position)
          ? next
          : min,
      null
    )
    if (!best) continue
    const match: Match = {
      sentence,
      ...best,
      graphemeCount: graphemeCount(sentence.japanese),
      pairId: sentence.pairId
    }
    const existing = byPair.get(sentence.pairId)
    if (!existing || compareRanks(match, existing) < 0) byPair.set(sentence.pairId, match)
  }
  return result([...byPair.values()].sort(compareRanks))
}
