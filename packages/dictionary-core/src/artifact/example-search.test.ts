import { DatabaseSync } from 'node:sqlite'
import { describe, expect, test } from 'vitest'
import type { ArtifactDatabase, SqlValue } from './database'
import { searchExamples } from './example-search'

const japanese = '例文です。'

function exampleIndex(english: readonly string[]): ArtifactDatabase {
  const database = new DatabaseSync(':memory:')
  database.exec(`
    CREATE TABLE example_sentences (
      id BLOB PRIMARY KEY, japanese TEXT NOT NULL, english TEXT NOT NULL
    );
    CREATE TABLE example_sentence_fts_map (
      fts_rowid INTEGER PRIMARY KEY, pair_id BLOB NOT NULL UNIQUE
    );
    CREATE VIRTUAL TABLE example_sentence_english_porter_fts USING fts4(english, tokenize=porter);
    CREATE VIRTUAL TABLE example_sentence_english_exact_fts USING fts4(english, tokenize=simple);
  `)
  const pair = database.prepare('INSERT INTO example_sentences VALUES (?, ?, ?)')
  const mapped = database.prepare('INSERT INTO example_sentence_fts_map VALUES (?, ?)')
  const stemmed = database.prepare(
    'INSERT INTO example_sentence_english_porter_fts(docid, english) VALUES (?, ?)'
  )
  const exact = database.prepare(
    'INSERT INTO example_sentence_english_exact_fts(docid, english) VALUES (?, ?)'
  )
  for (const [index, sentence] of english.entries()) {
    const id = Uint8Array.of(index)
    const row = index + 1
    pair.run(id, japanese, sentence)
    mapped.run(row, id)
    stemmed.run(row, sentence)
    exact.run(row, sentence)
  }
  return {
    all<Row>(sql: string, params: readonly SqlValue[] = []): Row[] {
      return database.prepare(sql).all(...params) as Row[]
    }
  }
}

function listed(english: readonly string[], query: string): string[] {
  const found = searchExamples(exampleIndex(english), query)
  if (typeof found === 'string') throw new Error(`「${query}」 was refused: ${found}`)
  expect(found.count).toBe(found.sentences.length)
  return found.sentences.map(sentence => sentence.english)
}

describe('an English query’s example sentences', () => {
  const startle = "I didn't mean to startle you."

  test.each([
    'startled you',
    'startling you',
    'startles you'
  ])('「%s」 finds the sentence that has its words in another form (#428)', query => {
    expect(listed([startle, 'You startled me.', 'Thank you.'], query)).toEqual([startle])
  })

  test('lists the sentences with the exact words before those that match only once stemmed', () => {
    expect(
      listed(
        ['Run!', 'He runs.', 'I saw him running to the station.', 'She is running.'],
        'running'
      )
    ).toEqual(['She is running.', 'I saw him running to the station.', 'Run!', 'He runs.'])
  })

  test('never matches across the end of a sentence, in any form of the words', () => {
    expect(listed(['That was startling. You know it.', startle], 'startled you')).toEqual([startle])
    expect(listed(['That was startling. You know it.'], 'startled you')).toEqual([])
  })

  test('lists nothing for words no sentence has in any form', () => {
    expect(listed([startle], 'startled him')).toEqual([])
  })
})
