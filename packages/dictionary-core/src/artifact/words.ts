import type {
  EntryRow,
  FormRow,
  FrequencyRow,
  KanjiGlossRow,
  PitchRow,
  SenseRestrictionRow
} from '../detail/rows'
import { wordSlug } from '../detail/slug'
import type { ArtifactDatabase } from './database'
import { frequencyByEntry, frequencyQueries } from './frequency'
import type { KanjiData } from './kanji-data'

export const jmdictSource = 'edrdg.jmdict'

const formKinds: Record<number, 'written' | 'reading'> = { 0: 'written', 1: 'reading' }

interface EntryRecord {
  id: string
  source_record_id: number
  headword: string
  reading: string
  summary: string
  parts_of_speech_json: string
  written_forms_json: string
  reading_forms_json: string
  senses_json: string
  relationships_json: string
  pitch_accent_json: string | null
  compound_pitch_json: string | null
  fingerprint: string
}

interface RelationshipRecord {
  headword: string
  reading: string
  summary: string
  relation: string
  targetID?: string | null
}

const entrySelect = `SELECT lower(hex(e.id)) AS id, e.source_record_id, e.headword, e.reading,
    e.summary, e.parts_of_speech_json, e.written_forms_json, e.reading_forms_json, e.senses_json,
    e.relationships_json, e.pitch_accent_json, c.pitch_accent_json AS compound_pitch_json,
    lower(hex(e.semantic_fingerprint)) AS fingerprint
  FROM entries e LEFT JOIN compound_pitch.entry_pitch c ON c.entry_id = e.id`

export interface WordRecord {
  entry: EntryRow
  frequency: FrequencyRow[]
  kanji: KanjiGlossRow[]
  fingerprint: string
  slug: string
  relatedSlugs: Map<number, string>
}

export function readWord(
  db: ArtifactDatabase,
  kanji: KanjiData,
  entSeq: number
): WordRecord | null {
  const [record] = db.all<EntryRecord>(
    `${entrySelect} WHERE e.source_identity = ? AND e.source_record_id = ?`,
    [jmdictSource, entSeq]
  )
  if (!record) return null

  const restrictions = new Map<number, SenseRestrictionRow[]>()
  for (const row of db.all<{ sense_order: number; kind: number; form: string }>(
    `SELECT sense_order, kind, form FROM sense_form_restrictions WHERE entry_id = unhex(?)
     ORDER BY sense_order, kind, form`,
    [record.id]
  )) {
    const kind = formKinds[row.kind]
    if (!kind) continue
    restrictions.set(row.sense_order, [
      ...(restrictions.get(row.sense_order) ?? []),
      { kind, form: row.form }
    ])
  }

  const relationships = JSON.parse(record.relationships_json) as RelationshipRecord[]
  const targetIds = [
    ...new Set(relationships.flatMap(({ targetID }) => (targetID ? [targetID.toLowerCase()] : [])))
  ]
  const targets = entriesById(db, targetIds)

  const writtenForms = JSON.parse(record.written_forms_json) as FormRow[]
  const queries = frequencyQueries([record.id])
  const frequency = frequencyByEntry(
    db.all(queries.levels, queries.params),
    db.all(queries.ranks, queries.params)
  )
  const entry: EntryRow = {
    id: record.id,
    entSeq: record.source_record_id,
    headword: record.headword,
    reading: record.reading,
    summary: record.summary,
    partsOfSpeech: JSON.parse(record.parts_of_speech_json),
    writtenForms,
    readingForms: JSON.parse(record.reading_forms_json),
    senses: (
      JSON.parse(record.senses_json) as Omit<EntryRow['senses'][number], 'restrictions'>[]
    ).map((sense, order) => ({ ...sense, restrictions: restrictions.get(order) ?? [] })),
    relationships: relationships.map(relationship => ({
      headword: relationship.headword,
      reading: relationship.reading,
      summary: relationship.summary,
      relation: relationship.relation,
      targetEntSeq: relationship.targetID
        ? (targets.get(relationship.targetID.toLowerCase())?.entSeq ?? null)
        : null
    })),
    pitch: record.pitch_accent_json ? (JSON.parse(record.pitch_accent_json) as PitchRow) : null,
    compoundPitch: record.compound_pitch_json
      ? (JSON.parse(record.compound_pitch_json) as PitchRow)
      : null
  }
  return {
    entry,
    frequency: frequency.get(record.id) ?? [],
    kanji: kanji.glossRows([entry.headword, ...writtenForms.map(form => form.value)]),
    fingerprint: record.fingerprint,
    slug: wordSlug(entry.headword, entry.reading),
    relatedSlugs: new Map(
      [...targets.values()].map(target => [
        target.entSeq,
        wordSlug(target.headword, target.reading)
      ])
    )
  }
}

export interface EntryIdentity {
  id: string
  entSeq: number
  headword: string
  reading: string
}

export function entriesById(
  db: ArtifactDatabase,
  ids: readonly string[]
): Map<string, EntryIdentity> {
  if (ids.length === 0) return new Map()
  const rows = db.all<{ id: string; ent_seq: number; headword: string; reading: string }>(
    `SELECT lower(hex(id)) AS id, source_record_id AS ent_seq, headword, reading FROM entries
     WHERE id IN (${ids.map(() => 'unhex(?)').join(', ')})`,
    ids
  )
  return new Map(
    rows.map(row => [
      row.id,
      { id: row.id, entSeq: row.ent_seq, headword: row.headword, reading: row.reading }
    ])
  )
}

export function slugsByEntSeq(
  db: ArtifactDatabase,
  entSeqs: readonly number[]
): Map<number, string> {
  const unique = [...new Set(entSeqs)]
  if (unique.length === 0) return new Map()
  const rows = db.all<{ ent_seq: number; headword: string; reading: string }>(
    `SELECT source_record_id AS ent_seq, headword, reading FROM entries
     WHERE source_identity = ? AND source_record_id IN (${unique.map(() => '?').join(', ')})`,
    [jmdictSource, ...unique]
  )
  return new Map(rows.map(row => [row.ent_seq, wordSlug(row.headword, row.reading)]))
}

export function canonicalEntryId(db: ArtifactDatabase, fingerprint: string): string {
  const [row] = db.all<{ id: string }>(
    `SELECT lower(hex(id)) AS id FROM entries WHERE semantic_fingerprint = unhex(?)
     ORDER BY lower(hex(id)) LIMIT 1`,
    [fingerprint]
  )
  if (!row) throw new Error(`No entry has the semantic fingerprint ${fingerprint}`)
  return row.id
}
