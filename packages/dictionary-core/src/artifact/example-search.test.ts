import { DatabaseSync } from 'node:sqlite'
import { describe, expect, test } from 'vitest'
import type { ArtifactDatabase } from './database'
import { searchExamples } from './example-search'
import { sqliteDatabase } from './sqlite-database'

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
  return sqliteDatabase(database)
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

  test('holds each word of a phrase to the query’s word at its place', () => {
    expect(
      listed(['My cat likes fish.', 'Cats like to sunbathe.', 'Cats are liked.'], 'cats likes')
    ).toEqual(['Cats like to sunbathe.', 'My cat likes fish.'])
  })

  test('lists the sentences with the exact words before those that match only once stemmed', () => {
    expect(
      listed(
        ['Run!', 'He runs.', 'I saw him running to the station.', 'She is running.'],
        'running'
      )
    ).toEqual(['She is running.', 'I saw him running to the station.', 'Run!', 'He runs.'])
  })

  test('beside a sentence with the exact words, lists every stemmed match, as it always has', () => {
    expect(listed(['Generally speaking, yes.', 'He is a general.'], 'general')).toEqual([
      'He is a general.',
      'Generally speaking, yes.'
    ])
  })

  test.each([
    ['generously', ['Generally speaking, history repeats itself.', 'He is a generous man.']],
    ['generously speaking', ['Generally speaking, history repeats itself.']],
    ['animating', ['Animals are our friends.']],
    ['privations', ['Private charity is only a drop in the bucket.']]
  ])('「%s」 lists no sentence whose word only shares its stem', (query, english) => {
    expect(listed(english, query)).toEqual([])
  })

  test('tells a word’s other forms from another word with its stem', () => {
    expect(listed(["I'm grateful for my family.", 'She grated the cheese.'], 'grate')).toEqual([
      'She grated the cheese.'
    ])
  })

  test('finds the word’s form further on when an earlier word only shares its stem', () => {
    expect(
      listed(['The university is old.', 'The university studies the universe.'], 'universes')
    ).toEqual(['The university studies the universe.'])
  })

  test('reads TVs as the plural of TV, and no two-letter word as another with an s', () => {
    expect(listed(['We have two TV sets.'], 'two tvs')).toEqual(['We have two TV sets.'])
    expect(listed(['I gave it to him.'], 'tos him')).toEqual([])
  })

  test('lists no other number for a number the stemmer cuts short', () => {
    const binary = 'The number 2015 is represented as 11111011111 in binary.'
    expect(listed([binary], '1111111')).toEqual([])
    expect(listed([binary], '11111011111')).toEqual([binary])
    expect(listed(['His annual income is more than $100000.'], '1000000')).toEqual([])
  })

  test('finds an underscore, which only the stemmed index reads as a word', () => {
    const warning = "Warning: unsupported characters are displayed using the '_' character."
    expect(listed([warning], '_')).toEqual([warning])
  })

  test('still asks a query with * for its exact words', () => {
    expect(listed([startle], 'startled y*')).toEqual([])
    expect(listed([startle], 'startle y*')).toEqual([startle])
  })

  test('holds a first word asked for with ^ to the same forms', () => {
    expect(listed(['Startled, he dropped the cup.', 'He startled me.'], '^startles')).toEqual([
      'Startled, he dropped the cup.'
    ])
  })

  test('never matches across the end of a sentence, in any form of the words', () => {
    expect(listed(['That was startling. You know it.', startle], 'startled you')).toEqual([startle])
    expect(listed(['That was startling. You know it.'], 'startled you')).toEqual([])
  })

  test('lists nothing for words no sentence has in any form', () => {
    expect(listed([startle], 'startled him')).toEqual([])
  })
})
