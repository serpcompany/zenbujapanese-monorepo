import { graphemeCount } from '../detail/text'
import {
  compareRanks,
  exampleLimit,
  graphemePosition,
  LexicalRelation,
  normalizedEntryEvidence,
  type RetrievalEntry,
  type RetrievalError,
  reportedExampleCount
} from '../examples/retrieval'
import type { ArtifactDatabase } from './database'

export interface ExampleSentence {
  rowid: number
  pairId: string
  japanese: string
  english: string
}

export interface EntryExamples {
  sentences: ExampleSentence[]
  count: number
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

function result(matches: Match[]): EntryExamples {
  return {
    sentences: matches.slice(0, exampleLimit).map(match => match.sentence),
    count: reportedExampleCount(matches.length),
    truncated: matches.length > exampleLimit
  }
}

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

export function retrieveEntryExamples(
  db: ArtifactDatabase,
  entry: RetrievalEntry
): EntryExamples | RetrievalError {
  const selectedForm = normalizedEntryEvidence(entry.headword)
  const reading = normalizedEntryEvidence(entry.reading)
  if (entry.id === '' || selectedForm === '' || reading === '') return 'missingEntryEvidence'
  const evidence = entryEvidence(db, entry.id)
  if (!evidence || evidence.reading !== reading) return 'missingEntryEvidence'
  const isKanaHeadword = selectedForm === reading
  if (isKanaHeadword) return retrieveIndexedEntry(db, entry.id, selectedForm)
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
