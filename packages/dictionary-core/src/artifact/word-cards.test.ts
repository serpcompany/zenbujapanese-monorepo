import { DatabaseSync } from 'node:sqlite'
import { afterAll, describe, expect, test } from 'vitest'
import type { ArtifactDatabase, SqlValue } from './database'
import { resolveEntSeq } from './word-cards'

const database = new DatabaseSync(':memory:')
database.exec(`
  CREATE TABLE entries (
    id BLOB PRIMARY KEY, source_record_id INTEGER, headword TEXT, reading TEXT, summary TEXT,
    semantic_fingerprint BLOB
  );
  CREATE TABLE forms (entry_id BLOB, kind INTEGER, form TEXT);
  CREATE INDEX forms_by_form ON forms (form, kind);
`)

const words: [entSeq: number, headword: string, reading: string, spellings: string[]][] = [
  [1296400, '有る', 'ある', ['在る']],
  [1546640, '要る', 'いる', []],
  [1577980, '居る', 'いる', []]
]
for (const [entSeq, headword, reading, spellings] of words) {
  const id = Buffer.from(entSeq.toString(16).padStart(32, '0'), 'hex')
  database
    .prepare('INSERT INTO entries VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, entSeq, headword, reading, '', id)
  for (const form of [headword, ...spellings]) {
    database.prepare('INSERT INTO forms VALUES (?, 0, ?)').run(id, form)
  }
  database.prepare('INSERT INTO forms VALUES (?, 1, ?)').run(id, reading)
}

const db: ArtifactDatabase = {
  all: <Row>(sql: string, params: readonly SqlValue[] = []) =>
    database.prepare(sql).all(...params) as Row[]
}

afterAll(() => database.close())

describe('resolving a related word written and read a given way', () => {
  test('finds the entry whose headword and reading they are', () => {
    expect(resolveEntSeq(db, '要る', 'いる')).toBe(1546640)
    expect(resolveEntSeq(db, '居る', 'いる')).toBe(1577980)
  })

  test('finds the entry by another of its spellings', () => {
    expect(resolveEntSeq(db, '在る', 'ある')).toBe(1296400)
  })

  test('answers null when no entry is written and read that way', () => {
    expect(resolveEntSeq(db, '要る', 'ある')).toBeNull()
    expect(resolveEntSeq(db, '食べる', 'たべる')).toBeNull()
  })
})
