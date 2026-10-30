import { readFileSync } from 'node:fs'
import type { DatabaseSync, SQLInputValue } from 'node:sqlite'
import type { AttachmentName } from '@zenbu/dictionary-core/artifact/database'
import { jmdictSource } from '@zenbu/dictionary-core/artifact/words'
import type { WordRows } from '@zenbu/dictionary-core/detail/rows'

export type Fill = (db: DatabaseSync) => void

type FixtureWord = Omit<WordRows, 'examples' | 'exampleCount'>

const fixtureWords: FixtureWord[] = JSON.parse(
  readFileSync(
    new URL('words.json', import.meta.resolve('@zenbu/dictionary-core/fixtures')),
    'utf8'
  )
)

const entryTables = `
  CREATE TABLE entries (
    id BLOB PRIMARY KEY,
    source_identity TEXT NOT NULL,
    source_record_id INTEGER NOT NULL,
    headword TEXT NOT NULL,
    reading TEXT NOT NULL,
    summary TEXT NOT NULL,
    meanings_json TEXT NOT NULL,
    parts_of_speech_json TEXT NOT NULL,
    written_forms_json TEXT NOT NULL,
    reading_forms_json TEXT NOT NULL,
    senses_json TEXT NOT NULL,
    relationships_json TEXT NOT NULL,
    pitch_accent_json TEXT,
    semantic_fingerprint BLOB NOT NULL
  );
  CREATE TABLE forms (entry_id BLOB NOT NULL, form TEXT NOT NULL, kind INTEGER NOT NULL);
  CREATE INDEX forms_form_index ON forms(form, entry_id);
  CREATE TABLE form_priority_profiles (
    entry_id BLOB NOT NULL, form TEXT NOT NULL, kind INTEGER NOT NULL,
    primary_mask INTEGER NOT NULL, secondary_mask INTEGER NOT NULL, news_frequency_band INTEGER,
    PRIMARY KEY(entry_id, form, kind)
  ) WITHOUT ROWID;
  CREATE TABLE canonical_senses (
    entry_id BLOB NOT NULL, sense_order INTEGER NOT NULL, parts_of_speech_json TEXT NOT NULL,
    PRIMARY KEY(entry_id, sense_order)
  ) WITHOUT ROWID;
  CREATE TABLE sense_form_restrictions (
    entry_id BLOB NOT NULL, sense_order INTEGER NOT NULL, kind INTEGER NOT NULL, form TEXT NOT NULL,
    PRIMARY KEY(entry_id, sense_order, kind, form)
  ) WITHOUT ROWID;
  CREATE TABLE reading_form_restrictions (
    entry_id BLOB NOT NULL, reading TEXT NOT NULL, written_form TEXT NOT NULL,
    PRIMARY KEY(entry_id, reading, written_form)
  ) WITHOUT ROWID;
  CREATE TABLE example_sentences (id BLOB PRIMARY KEY, japanese TEXT NOT NULL, english TEXT NOT NULL);
  CREATE TABLE sense_examples (
    entry_id BLOB NOT NULL, sense_order INTEGER NOT NULL, example_order INTEGER NOT NULL,
    pair_id BLOB NOT NULL
  );`

const formKinds = { written: 0, reading: 1 } as const

const blob = (id: string) => new Uint8Array(Buffer.from(id, 'hex'))

const json = (value: unknown) => JSON.stringify(value)

export const fillEntries: Fill = db => {
  db.exec(entryTables)
  const entry = db.prepare(
    `INSERT INTO entries VALUES (${Array.from({ length: 14 }, () => '?').join(', ')})`
  )
  const form = db.prepare('INSERT INTO forms VALUES (?, ?, ?)')
  const sense = db.prepare('INSERT INTO canonical_senses VALUES (?, ?, ?)')
  const restriction = db.prepare('INSERT INTO sense_form_restrictions VALUES (?, ?, ?, ?)')
  for (const { entry: row } of fixtureWords) {
    const id = blob(row.id)
    entry.run(
      id,
      jmdictSource,
      row.entSeq,
      row.headword,
      row.reading,
      row.summary,
      json(row.senses.map(({ meaning }) => meaning)),
      json(row.partsOfSpeech),
      json(row.writtenForms),
      json(row.readingForms),
      json(
        row.senses.map(({ meaning, notes, partsOfSpeech }) => ({ meaning, notes, partsOfSpeech }))
      ),
      json(row.relationships.map(({ targetEntSeq, ...shown }) => shown)),
      row.pitch ? json(row.pitch) : null,
      id
    )
    for (const { value, kind } of [...row.writtenForms, ...row.readingForms]) {
      form.run(id, value, formKinds[kind])
    }
    row.senses.forEach(({ partsOfSpeech, restrictions }, order) => {
      sense.run(id, order, json(partsOfSpeech))
      for (const { kind, form } of restrictions) restriction.run(id, order, formKinds[kind], form)
    })
  }
}

const perEntry =
  (
    table: string,
    key: string,
    column: string,
    value: (rows: FixtureWord) => SQLInputValue[]
  ): Fill =>
  db => {
    db.exec(`CREATE TABLE ${table} (${key} BLOB PRIMARY KEY, ${column} NOT NULL) WITHOUT ROWID`)
    const insert = db.prepare(`INSERT INTO ${table} VALUES (?, ?)`)
    for (const rows of fixtureWords) {
      for (const found of value(rows)) insert.run(blob(rows.entry.id), found)
    }
  }

export const attachmentRows: Partial<Record<AttachmentName, Fill>> = {
  compound_pitch: perEntry('entry_pitch', 'entry_id', 'pitch_accent_json TEXT', ({ entry }) =>
    entry.compoundPitch ? [json(entry.compoundPitch)] : []
  ),
  jlpt: perEntry('level_evidence', 'language_reference_id', 'level INTEGER', ({ frequency }) =>
    frequency.flatMap(row => (row.pack === 'jlpt' ? [row.level] : []))
  ),
  tubelex: perEntry(
    'frequency_evidence',
    'language_reference_id',
    'rank INTEGER',
    ({ frequency }) => frequency.flatMap(row => (row.pack === 'tubelex' ? [row.rank] : []))
  )
}
