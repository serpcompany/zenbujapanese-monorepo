import { DatabaseSync } from 'node:sqlite'
import { afterAll, describe, expect, test } from 'vitest'
import { ask } from './fake-host'
import type { EmbeddedHost } from './host'
import { type LearnerWord, spokenForm } from './siri-words'

const words = [
  { id: 1, headword: '食べる', reading: 'たべる', level: 5, rank: 50 },
  { id: 2, headword: '飲む', reading: 'のむ', level: 5, rank: 80 },
  { id: 3, headword: 'はい', reading: 'はい', level: 5, rank: null },
  { id: 4, headword: 'ラーメン', reading: 'ラーメン', level: 5, rank: 300 },
  { id: 5, headword: '学校', reading: 'がっこう', level: 4, rank: 10 },
  { id: 6, headword: '橋', reading: 'はし', level: 3, rank: 900 },
  { id: 7, headword: '箸', reading: 'はし', level: 3, rank: 950 },
  { id: 8, headword: '経済', reading: 'けいざい', level: 2, rank: 5 },
  { id: 9, headword: '今日', reading: 'きょう', level: null, rank: null },
  { id: 10, headword: '今日', reading: 'こんにち', level: null, rank: null },
  { id: 11, headword: '見る', reading: 'みる', level: null, rank: null }
]

const database = new DatabaseSync(':memory:')

afterAll(() => database.close())

database.exec(`
  CREATE TABLE entries (id BLOB PRIMARY KEY, headword TEXT NOT NULL, reading TEXT NOT NULL);
  CREATE TABLE forms (entry_id BLOB NOT NULL, form TEXT NOT NULL, kind INTEGER NOT NULL);
  ATTACH DATABASE ':memory:' AS jlpt;
  ATTACH DATABASE ':memory:' AS tubelex;
  CREATE TABLE jlpt.level_evidence (language_reference_id BLOB PRIMARY KEY, level INTEGER NOT NULL);
  CREATE TABLE tubelex.frequency_evidence (language_reference_id BLOB PRIMARY KEY, rank INTEGER NOT NULL);
`)
for (const { id, headword, reading, level, rank } of words) {
  const key = new Uint8Array([id])
  database.prepare('INSERT INTO entries VALUES (?, ?, ?)').run(key, headword, reading)
  database.prepare('INSERT INTO forms VALUES (?, ?, 0), (?, ?, 1)').run(key, headword, key, reading)
  if (level !== null)
    database.prepare('INSERT INTO jlpt.level_evidence VALUES (?, ?)').run(key, level)
  if (rank !== null) {
    database.prepare('INSERT INTO tubelex.frequency_evidence VALUES (?, ?)').run(key, rank)
  }
}

const host: EmbeddedHost = {
  all: (sql, parametersJSON) => ({
    rows: database.prepare(sql).all(...(JSON.parse(parametersJSON) as string[])) as Record<
      string,
      unknown
    >[]
  })
}

const siriWords = (learner: LearnerWord[], limit = 100) =>
  ask(host, 'siriWords', JSON.stringify({ learner, limit }))

describe('the words Zenbu tells Siri about', () => {
  test('a word is spoken in English letters: as typed in them, or in romaji without marks', () => {
    expect(spokenForm('Taberu')).toBe('taberu')
    expect(spokenForm('ｅａｔ')).toBe('eat')
    expect(spokenForm("don't  know")).toBe("don't know")
    expect(spokenForm('たべる')).toBe('taberu')
    expect(spokenForm('こんにちは')).toBe('konnichiha')
    expect(spokenForm('ラーメン')).toBe('ramen')
    expect(spokenForm('がっこう')).toBe('gakkou')
  })

  test('a word Siri could not hear as a few English words has no spoken form', () => {
    for (const unspoken of [
      '食べる',
      '100',
      'I would like to eat',
      'pneumonoultramicroscopicsilicovolcanoconiosis',
      ''
    ]) {
      expect(spokenForm(unspoken), unspoken).toBeNull()
    }
  })

  test('lists the learner’s words in their order, then common words from N5 to N3 by YouTube frequency, each spoken form once', async () => {
    expect(
      await siriWords([
        { written: 'eat' },
        { written: '見る', reading: null },
        { written: '今日', reading: null },
        { written: '飲む', reading: 'のむ' },
        { written: 'Taberu', reading: null },
        { written: 'I would like to eat sushi', reading: null }
      ])
    ).toEqual([
      { spoken: 'eat', written: 'eat' },
      { spoken: 'miru', written: '見る' },
      { spoken: 'nomu', written: '飲む' },
      { spoken: 'taberu', written: 'Taberu' },
      { spoken: 'ramen', written: 'ラーメン' },
      { spoken: 'hai', written: 'はい' },
      { spoken: 'gakkou', written: '学校' },
      { spoken: 'hashi', written: '橋' }
    ])
  })

  test('stops at the limit, the learner’s words first', async () => {
    expect(await siriWords([{ written: '見る', reading: 'みる' }], 3)).toEqual([
      { spoken: 'miru', written: '見る' },
      { spoken: 'taberu', written: '食べる' },
      { spoken: 'nomu', written: '飲む' }
    ])
  })
})
