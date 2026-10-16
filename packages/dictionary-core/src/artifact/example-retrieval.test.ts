import { DatabaseSync } from 'node:sqlite'
import { describe, expect, test } from 'vitest'
import type { RetrievalEntry } from '../examples/retrieval'
import type { ArtifactDatabase } from './database'
import { retrieveEntryExamples } from './example-retrieval'
import { sqliteDatabase } from './sqlite-database'

interface StoredEntry extends RetrievalEntry {
  storedForms: { written?: string[]; reading: string[] }
  indexed?: { sentence: string; surface: string }[]
}

const written = 0
const spoken = 1

function artifact(entries: readonly StoredEntry[], sentences: readonly string[]): ArtifactDatabase {
  const database = new DatabaseSync(':memory:')
  database.exec(`
    ATTACH DATABASE ':memory:' AS word_index;
    CREATE TABLE entries (
      id BLOB PRIMARY KEY, reading TEXT NOT NULL, written_forms_json TEXT NOT NULL
    );
    CREATE TABLE forms (entry_id BLOB NOT NULL, form TEXT NOT NULL, kind INTEGER NOT NULL);
    CREATE TABLE example_sentences (
      id BLOB PRIMARY KEY, japanese TEXT NOT NULL, english TEXT NOT NULL
    );
    CREATE TABLE word_index.entry_sentences (
      entry_id BLOB NOT NULL, pair_id BLOB NOT NULL, surface TEXT NOT NULL
    );
  `)
  const pairId = (japanese: string) => Uint8Array.of(sentences.indexOf(japanese) + 1)
  const sentence = database.prepare('INSERT INTO example_sentences VALUES (?, ?, ?)')
  for (const japanese of sentences) sentence.run(pairId(japanese), japanese, '')
  const entry = database.prepare('INSERT INTO entries VALUES (unhex(?), ?, ?)')
  const form = database.prepare('INSERT INTO forms VALUES (unhex(?), ?, ?)')
  const indexed = database.prepare('INSERT INTO word_index.entry_sentences VALUES (unhex(?), ?, ?)')
  for (const { id, reading, writtenForms, storedForms, indexed: links = [] } of entries) {
    entry.run(id, reading, JSON.stringify(writtenForms.map(value => ({ value }))))
    for (const value of storedForms.written ?? []) form.run(id, value, written)
    for (const value of storedForms.reading) form.run(id, value, spoken)
    for (const link of links) indexed.run(id, pairId(link.sentence), link.surface)
  }
  return sqliteDatabase(database)
}

function listed(db: ArtifactDatabase, entry: RetrievalEntry): string[] {
  const found = retrieveEntryExamples(db, entry)
  if (typeof found === 'string') throw new Error(`${entry.headword} answered ${found}`)
  expect(found.count).toBe(found.sentences.length)
  return found.sentences.map(sentence => sentence.japanese)
}

const tShirt: StoredEntry = {
  id: 'eb54c99bef0320396d822893952aab65',
  headword: 'Ｔシャツ',
  reading: 'ティーシャツ',
  writtenForms: ['Ｔシャツ'],
  storedForms: { written: ['tシャツ'], reading: ['ティーシャツ'] }
}

const cdPlayer: StoredEntry = {
  id: '825758589be7029aa4c84964451fa935',
  headword: 'ＣＤプレーヤー',
  reading: 'シーディープレーヤー',
  writtenForms: ['ＣＤプレーヤー', 'ＣＤプレイヤー'],
  storedForms: {
    written: ['cdプレイヤー', 'cdプレーヤー'],
    reading: ['シーディープレイヤー', 'シーディープレーヤー']
  }
}

describe('a word whose headword or reading NFKC changes finds its examples', () => {
  test('Ｔシャツ lists the sentences written with Ｔシャツ and with Tシャツ, as one word', () => {
    const sentences = [
      '新しいTシャツを買った。',
      'Ｔシャツを着た。',
      'ティーシャツと読む。',
      'tシャツは別の書き方だ。',
      'シャツを洗った。'
    ]
    expect(listed(artifact([tShirt], sentences), tShirt)).toEqual([
      'Ｔシャツを着た。',
      '新しいTシャツを買った。',
      'ティーシャツと読む。'
    ])
  })

  test('ＣＤプレーヤー lists its headword in either width, then its other spelling, then its reading', () => {
    const sentences = [
      'シーディープレーヤーが壊れた。',
      '古いCDプレイヤーがある。',
      '新しいCDプレーヤーを買った。',
      'ＣＤプレーヤーを直した。'
    ]
    expect(listed(artifact([cdPlayer], sentences), cdPlayer)).toEqual([
      'ＣＤプレーヤーを直した。',
      '新しいCDプレーヤーを買った。',
      '古いCDプレイヤーがある。',
      'シーディープレーヤーが壊れた。'
    ])
  })

  test('ﾀﾋ, read as its stored form タヒ, lists the sentences its index links in either width', () => {
    const sentences = ['ﾀﾋんだ。', 'タヒった。']
    const tahi: StoredEntry = {
      id: 'c1c7f6a2d7036b2602d90afc151197da',
      headword: 'ﾀﾋ',
      reading: 'ﾀﾋ',
      writtenForms: [],
      storedForms: { reading: ['タヒ'] },
      indexed: [
        { sentence: 'ﾀﾋんだ。', surface: 'ﾀﾋ' },
        { sentence: 'タヒった。', surface: 'タヒ' }
      ]
    }
    expect(listed(artifact([tahi], sentences), tahi)).toEqual(['ﾀﾋんだ。', 'タヒった。'])
  })

  test('オビ＝ワン・ケノービ, read as its stored form with an ASCII =, lists its sentences', () => {
    const sentences = ['オビ＝ワン・ケノービが来た。']
    const obiWan: StoredEntry = {
      id: 'fde8b0d81ec651dd11bf7712951938b1',
      headword: 'オビ＝ワン・ケノービ',
      reading: 'オビ＝ワン・ケノービ',
      writtenForms: [],
      storedForms: { reading: ['オビ=ワン・ケノービ'] },
      indexed: [{ sentence: 'オビ＝ワン・ケノービが来た。', surface: 'オビ＝ワン・ケノービ' }]
    }
    expect(listed(artifact([obiWan], sentences), obiWan)).toEqual(['オビ＝ワン・ケノービが来た。'])
  })

  test('two entries written and read alike in different widths share one word, so neither lists any', () => {
    const asciiTShirt: StoredEntry = {
      ...tShirt,
      id: '00000000000000000000000000000001',
      headword: 'Tシャツ',
      writtenForms: ['Tシャツ']
    }
    const db = artifact([tShirt, asciiTShirt], ['Ｔシャツを着た。', 'Tシャツを買った。'])
    expect(listed(db, tShirt)).toEqual([])
    expect(listed(db, asciiTShirt)).toEqual([])
  })

  test('entries written alike but for case, ＣＭ and ｃｍ, are two words: each lists its own', () => {
    const word = (id: string, headword: string): StoredEntry => ({
      id,
      headword,
      reading: 'シー・エム',
      writtenForms: [headword],
      storedForms: { written: ['cm'], reading: ['シー・エム'] }
    })
    const commercial = word('8a2d3bdf8a1c5ae4b8a3e3d0e1f2a3b4', 'ＣＭ')
    const centimetre = word('9b3e4ce09b2d6bf5c9b4f4e1f2a3b4c5', 'ｃｍ')
    const db = artifact(
      [commercial, centimetre],
      ['テレビのＣＭを見た。', 'CMが流れた。', '身長は170cmです。', '５ｃｍ短い。']
    )
    expect(listed(db, commercial)).toEqual(['CMが流れた。', 'テレビのＣＭを見た。'])
    expect(listed(db, centimetre)).toEqual(['５ｃｍ短い。', '身長は170cmです。'])
  })

  test('an entry its stored forms don’t write or read as it says still answers missingEntryEvidence', () => {
    const db = artifact([tShirt], ['Ｔシャツを着た。'])
    expect(retrieveEntryExamples(db, { ...tShirt, headword: 'Ｖネック' })).toBe(
      'missingEntryEvidence'
    )
    expect(retrieveEntryExamples(db, { ...tShirt, reading: 'シャツ' })).toBe('missingEntryEvidence')
  })
})
