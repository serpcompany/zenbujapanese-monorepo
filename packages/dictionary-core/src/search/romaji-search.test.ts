import { DatabaseSync } from 'node:sqlite'
import { describe, expect, test } from 'vitest'
import { searchDatabase } from '../artifact/database'
import { sqliteDatabase } from '../artifact/sqlite-database'
import { FormKind } from './database'
import { romajiSearchForms } from './romaji-forms'
import { DictionarySearch } from './search'

interface Word {
  headword: string
  reading: string
  gloss: string
  partOfSpeech?: string
  common?: boolean
}

const words: Word[] = [
  { headword: 'ラーメン', reading: 'ラーメン', gloss: 'ramen', common: true },
  { headword: '禁煙', reading: 'きんえん', gloss: 'abstinence from smoking' },
  { headword: '記念', reading: 'きねん', gloss: 'commemoration', common: true },
  { headword: '続く', reading: 'つづく', gloss: 'to continue', partOfSpeech: 'godanVerb' },
  { headword: 'ファイル', reading: 'ファイル', gloss: 'file', common: true },
  {
    headword: 'を',
    reading: 'を',
    gloss: 'indicates direct object of action',
    partOfSpeech: 'particle'
  },
  { headword: 'ビル', reading: 'ビル', gloss: 'building' },
  { headword: 'ビール', reading: 'ビール', gloss: 'beer', common: true },
  { headword: 'ビルディング', reading: 'ビルディング', gloss: 'edifice' },
  { headword: '食べる', reading: 'たべる', gloss: 'to eat', partOfSpeech: 'ichidanVerb' },
  { headword: 'タベータ', reading: 'タベータ', gloss: 'an invented word' },
  { headword: 'ヅタ', reading: 'ヅタ', gloss: 'an invented word, shown dzuta' },
  { headword: 'ヅル', reading: 'ヅル', gloss: 'an invented verb', partOfSpeech: 'godanVerb' },
  { headword: '動物相', reading: 'どうぶつそう', gloss: 'fauna' },
  { headword: 'ファウナ', reading: 'ファウナ', gloss: 'fauna' },
  { headword: '心', reading: 'こころ', gloss: 'mind' },
  { headword: 'こゝろ', reading: 'こゝろ', gloss: 'heart, in old writing', common: true },
  { headword: 'カフェ', reading: 'カフェ', gloss: 'café' },
  { headword: 'エリート', reading: 'エリート', gloss: 'elite' }
]

const ichi1 = 2

function romajiDictionary(): DictionarySearch {
  const database = new DatabaseSync(':memory:')
  database.exec(`
    CREATE TABLE entries (
      id BLOB PRIMARY KEY, source_record_id INTEGER, headword TEXT, reading TEXT, summary TEXT,
      parts_of_speech_json TEXT, semantic_fingerprint BLOB
    );
    CREATE TABLE forms (entry_id BLOB, form TEXT, kind INTEGER);
    CREATE TABLE shown_romaji_forms (entry_id BLOB, form TEXT, kind INTEGER);
    CREATE TABLE form_priority_profiles (
      entry_id BLOB, form TEXT, kind INTEGER, primary_mask INTEGER, secondary_mask INTEGER,
      news_frequency_band INTEGER
    );
    CREATE TABLE canonical_senses (entry_id BLOB, sense_order INTEGER, parts_of_speech_json TEXT);
    CREATE TABLE sense_form_restrictions (entry_id BLOB, sense_order INTEGER, kind INTEGER, form TEXT);
    CREATE TABLE reading_form_restrictions (entry_id BLOB, reading TEXT, written_form TEXT);
    CREATE TABLE gloss_atoms (
      entry_id BLOB, sense_order INTEGER, gloss_order INTEGER, text TEXT, normalized_text TEXT
    );
  `)
  const insert = (table: string, values: unknown[]) =>
    database
      .prepare(`INSERT INTO ${table} VALUES (${values.map(() => '?').join(', ')})`)
      .run(...(values as never[]))
  for (const [index, word] of words.entries()) {
    const id = Uint8Array.of(index + 1)
    const partsOfSpeech = JSON.stringify([word.partOfSpeech ?? 'noun'])
    insert('entries', [id, index + 1, word.headword, word.reading, word.gloss, partsOfSpeech, id])
    const shownKind = word.headword === word.reading ? FormKind.reading : FormKind.written
    if (shownKind === FormKind.written) insert('forms', [id, word.headword, FormKind.written])
    insert('forms', [id, word.reading, FormKind.reading])
    const { romaji, shownRomaji, unmarkedRomaji } = romajiSearchForms([word.reading])
    for (const form of romaji) insert('forms', [id, form, FormKind.romaji])
    for (const form of shownRomaji) insert('shown_romaji_forms', [id, form, FormKind.shownRomaji])
    for (const form of unmarkedRomaji) {
      insert('shown_romaji_forms', [id, form, FormKind.unmarkedRomaji])
    }
    if (word.common)
      insert('form_priority_profiles', [id, word.headword, shownKind, ichi1, 0, null])
    insert('canonical_senses', [id, 0, partsOfSpeech])
    insert('gloss_atoms', [id, 0, 0, word.gloss, word.gloss])
  }
  database.exec(`
    CREATE VIRTUAL TABLE dictionary_gloss_fts USING fts4(normalized_text, content='gloss_atoms', tokenize=porter);
    INSERT INTO dictionary_gloss_fts(docid, normalized_text) SELECT rowid, normalized_text FROM gloss_atoms;
    CREATE VIRTUAL TABLE dictionary_form_fts USING fts4(form, content='forms', tokenize=simple);
    INSERT INTO dictionary_form_fts(docid, form) SELECT rowid, form FROM forms;
    CREATE VIRTUAL TABLE shown_romaji_fts USING fts4(form, content='shown_romaji_forms', tokenize=simple);
    INSERT INTO shown_romaji_fts(docid, form) SELECT rowid, form FROM shown_romaji_forms;
  `)
  return new DictionarySearch(searchDatabase(sqliteDatabase(database)))
}

const search = romajiDictionary()
const found = async (query: string) =>
  (await search.search(query)).items.map(item => item.entry.headword)

describe('a romaji search', () => {
  test.each([
    ['rāmen', 'ラーメン'],
    ['RĀMEN', 'ラーメン'],
    ["kin'en", '禁煙'],
    ['tsudzuku', '続く'],
    ['fairu', 'ファイル'],
    ['wo', 'を'],
    ['bīru', 'ビール']
  ])('finds a word by the romaji the apps show: %s is %s', async (query, headword) => {
    expect((await found(query))[0]).toBe(headword)
  })

  test.each([
    ['raamen', 'ラーメン'],
    ['kinen', '記念'],
    ['tsuzuku', '続く'],
    ['fuiru', 'ファイル'],
    ['biiru', 'ビール']
  ])('still finds a word by the ASCII spelling earlier releases searched: %s is %s', async (query, headword) => {
    expect((await found(query))[0]).toBe(headword)
  })

  test('ranks the words an ASCII spelling finds as before, though one of them is shown otherwise', async () => {
    expect(await found('kinen')).toEqual(['記念', '禁煙'])
    expect(await found("kin'en")).toEqual(['禁煙'])
  })

  test('finds a word by its romaji without macrons, as the website’s titles write it, after every word the query found before', async () => {
    expect(await found('biru')).toEqual(['ビル', 'ビルディング', 'ビール'])
    expect(await found('ramen')).toEqual(['ラーメン'])
  })

  test('a match without macrons doesn’t stop a conjugated verb from finding its dictionary form first', async () => {
    expect(await found('tabeta')).toEqual(['食べる', 'タベータ'])
  })

  test('ranks a word its shown romaji spells after the words spelled that way before, whatever their priority', async () => {
    expect(await found('kokoro')).toEqual(['心', 'こゝろ'])
  })

  test('keeps an English query’s order: a shown romaji that is also the meaning moves nothing up', async () => {
    expect(await found('fauna')).toEqual(['動物相', 'ファウナ'])
  })

  test('a shown spelling that looks conjugated leads with its dictionary form, as a stored spelling does', async () => {
    const results = await search.search('dzuta')
    expect(results.items.map(item => item.entry.headword)).toEqual(['ヅル', 'ヅタ'])
    expect(results.readingRefinement).toBeNull()
  })

  test('offers the reading of the word its shown romaji names', async () => {
    expect((await search.search('rāmen')).readingRefinement).toBe('ラーメン')
    expect((await search.search('tsudzuku')).readingRefinement).toBe('つづく')
  })

  test('a word in other Latin letters than romaji’s is searched in English when Japanese finds nothing, as typed, then without its accents', async () => {
    expect(await found('café')).toEqual(['カフェ'])
    expect(await found('Café')).toEqual(['カフェ'])
    expect(await found('élite')).toEqual(['エリート'])
  })
})
