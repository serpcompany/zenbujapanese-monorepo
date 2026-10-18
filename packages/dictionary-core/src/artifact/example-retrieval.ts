import { graphemeCount } from '../detail/text'
import {
  compareRanks,
  earliestPosition,
  exampleLimit,
  LexicalRelation,
  normalizedEntryEvidence,
  type RetrievalEntry,
  type RetrievalError,
  reportedExampleCount,
  spellingsOf
} from '../examples/retrieval'
import { normalizeQuery } from '../search/query'
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

interface Evidence {
  relation: number
  position: number
}

interface EvidenceTerm {
  spellings: string[]
  relation: number
}

const sentenceColumns = 'e.rowid AS rowid, lower(hex(e.id)) AS pairId, e.japanese, e.english'

const storedForm = normalizeQuery

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
  if (reading === undefined || !readingForms.has(storedForm(reading))) return null
  return { reading: normalizedEntryEvidence(reading), writtenForms }
}

function unambiguousEntryCount(
  db: ArtifactDatabase,
  selectedForm: string,
  reading: string
): number {
  const rows = db.all<{ writtenForms: string }>(
    `SELECT DISTINCT lower(hex(e.id)) AS id, e.written_forms_json AS writtenForms
     FROM entries e
     JOIN forms written ON written.entry_id = e.id AND written.kind = 0 AND written.form = ?
     JOIN forms spoken ON spoken.entry_id = e.id AND spoken.kind = 1 AND spoken.form = ?`,
    [storedForm(selectedForm), storedForm(reading)]
  )
  const writtenAsSelected = (json: string) =>
    (JSON.parse(json) as { value: string }[]).some(
      form => normalizedEntryEvidence(form.value) === selectedForm
    )
  return rows.filter(row => writtenAsSelected(row.writtenForms)).length
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
    const position = earliestPosition(spellingsOf(surface, [rawSurface]), sentence.japanese)
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

function bestEvidence(terms: readonly EvidenceTerm[], japanese: string): Evidence | null {
  let best: Evidence | null = null
  for (const { spellings, relation } of terms) {
    const position = earliestPosition(spellings, japanese)
    if (position === null) continue
    const outranks =
      !best || relation < best.relation || (relation === best.relation && position < best.position)
    if (outranks) best = { relation, position }
  }
  return best
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
  if (!evidence.writtenForms.has(storedForm(selectedForm))) return 'missingEntryEvidence'
  if (unambiguousEntryCount(db, selectedForm, reading) !== 1) return result([])

  const written = [entry.headword, ...entry.writtenForms]
  const alternateForms = entry.writtenForms
    .map(normalizedEntryEvidence)
    .filter(form => form !== selectedForm && evidence.writtenForms.has(storedForm(form)))
  const evidenceTerms: EvidenceTerm[] = [
    {
      spellings: spellingsOf(selectedForm, written),
      relation: LexicalRelation.selectedWrittenForm
    },
    ...[...new Set(alternateForms)].sort().map(form => ({
      spellings: spellingsOf(form, written),
      relation: LexicalRelation.alternateWrittenForm
    })),
    { spellings: spellingsOf(reading, [entry.reading]), relation: LexicalRelation.reading }
  ]
  const terms = [...new Set(evidenceTerms.flatMap(term => term.spellings))]
  const rows = db.all<ExampleSentence>(
    `SELECT ${sentenceColumns} FROM example_sentences e
     WHERE ${terms.map(() => 'instr(e.japanese, ?) > 0').join(' OR ')}`,
    terms
  )

  const byPair = new Map<string, Match>()
  for (const sentence of rows) {
    const best = bestEvidence(evidenceTerms, sentence.japanese)
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
