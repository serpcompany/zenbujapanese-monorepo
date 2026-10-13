import type { FrequencyRow } from '../detail/rows'
import { searchResultsScreen } from '../results/results'
import { FormKind } from './database'
import type { DictionarySearch, SearchDatabase, SearchResults } from './search'

export interface Word {
  headword: string
  reading: string
  romaji: string
  meanings: string[]
  isCommon?: boolean
}

type Parameter = string | number | Uint8Array

interface Statement {
  run(...parameters: Parameter[]): unknown
  all(...parameters: Parameter[]): unknown[]
}

interface MemoryDatabase {
  exec(sql: string): void
  prepare(sql: string): Statement
}

const learnerPriority = 2

export function dictionary(database: MemoryDatabase, words: readonly Word[]): SearchDatabase {
  database.exec(`
    CREATE TABLE entries (
      id BLOB PRIMARY KEY, source_record_id INTEGER NOT NULL, headword TEXT NOT NULL,
      reading TEXT NOT NULL, summary TEXT NOT NULL, parts_of_speech_json TEXT NOT NULL,
      semantic_fingerprint BLOB NOT NULL
    );
    CREATE TABLE forms (entry_id BLOB NOT NULL, form TEXT NOT NULL, kind INTEGER NOT NULL);
    CREATE INDEX forms_form_index ON forms(form, entry_id);
    CREATE TABLE gloss_atoms (
      entry_id BLOB NOT NULL, sense_order INTEGER NOT NULL, gloss_order INTEGER NOT NULL,
      text TEXT NOT NULL, normalized_text TEXT NOT NULL
    );
    CREATE TABLE canonical_senses (
      entry_id BLOB NOT NULL, sense_order INTEGER NOT NULL, parts_of_speech_json TEXT NOT NULL
    );
    CREATE TABLE sense_form_restrictions (
      entry_id BLOB NOT NULL, sense_order INTEGER NOT NULL, kind INTEGER NOT NULL,
      form TEXT NOT NULL
    );
    CREATE TABLE reading_form_restrictions (
      entry_id BLOB NOT NULL, reading TEXT NOT NULL, written_form TEXT NOT NULL
    );
    CREATE TABLE form_priority_profiles (
      entry_id BLOB NOT NULL, form TEXT NOT NULL, kind INTEGER NOT NULL,
      primary_mask INTEGER NOT NULL, secondary_mask INTEGER NOT NULL, news_frequency_band INTEGER
    );
    CREATE VIRTUAL TABLE dictionary_gloss_fts USING fts4(
      normalized_text, content='gloss_atoms', tokenize=porter
    );
    CREATE VIRTUAL TABLE dictionary_form_fts USING fts4(form, content='forms', tokenize=simple);
  `)
  const entry = database.prepare('INSERT INTO entries VALUES (?, ?, ?, ?, ?, ?, ?)')
  const form = database.prepare('INSERT INTO forms VALUES (?, ?, ?)')
  const gloss = database.prepare('INSERT INTO gloss_atoms VALUES (?, 0, ?, ?, ?)')
  const sense = database.prepare("INSERT INTO canonical_senses VALUES (?, 0, '[]')")
  const priority = database.prepare(
    `INSERT INTO form_priority_profiles VALUES (?, ?, ?, ${learnerPriority}, 0, NULL)`
  )
  for (const [index, word] of words.entries()) {
    const id = Uint8Array.of(index + 1)
    const shownKind = word.headword === word.reading ? FormKind.reading : FormKind.written
    entry.run(id, index + 1, word.headword, word.reading, word.meanings.join('; '), '[]', id)
    if (shownKind === FormKind.written) form.run(id, word.headword, FormKind.written)
    form.run(id, word.reading, FormKind.reading)
    form.run(id, word.romaji, FormKind.romaji)
    sense.run(id)
    if (word.isCommon) priority.run(id, word.headword, shownKind)
    for (const [order, meaning] of word.meanings.entries()) {
      gloss.run(id, order, meaning, meaning.toLowerCase())
    }
  }
  database.exec(`
    INSERT INTO dictionary_gloss_fts(dictionary_gloss_fts) VALUES('rebuild');
    INSERT INTO dictionary_form_fts(dictionary_form_fts) VALUES('rebuild');
  `)
  return {
    async all<Row>(sql: string, params: readonly (string | number)[]) {
      return database.prepare(sql).all(...params) as Row[]
    }
  }
}

export const word = (
  headword: string,
  reading: string,
  romaji: string,
  ...meanings: string[]
): Word => ({ headword, reading, romaji, meanings })

export function candidates(results: SearchResults): string[][] {
  const words: string[][] = []
  for (const item of results.items) {
    words[item.sourceOrder] = [...(words[item.sourceOrder] ?? []), item.entry.headword]
  }
  return words
}

export async function listed(
  search: DictionarySearch,
  query: string,
  jlptLevels: Record<string, number> = {}
): Promise<string[]> {
  const results = await search.search(query)
  const frequency = new Map<string, FrequencyRow[]>()
  for (const { entry } of results.items) {
    const level = jlptLevels[entry.headword]
    if (level) frequency.set(entry.id, [{ pack: 'jlpt', level }])
  }
  const screen = searchResultsScreen(query, results, frequency)
  return screen.state === 'results' ? screen.rows.map(row => row.headword) : []
}
