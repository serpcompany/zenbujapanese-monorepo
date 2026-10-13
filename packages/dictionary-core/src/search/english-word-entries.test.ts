import { DatabaseSync } from 'node:sqlite'
import { describe, expect, test } from 'vitest'
import type { SearchDatabase } from './database'
import { rankedByStrongGloss } from './english'
import { candidatesFromExamples, entriesExamplesUse } from './english-word-entries'
import { matchLabel } from './rank'
import { DictionarySearch, type SearchResults } from './search'

interface Entry {
  id: string
  headword: string
  reading: string
  senses: string[][]
  fingerprint?: string
}

const entries: Entry[] = [
  { id: '0a', headword: '書く', reading: 'かく', senses: [['to write', 'to compose', 'to pen']] },
  { id: '0b', headword: 'ペン', reading: 'ペン', senses: [['pen']] },
  { id: '0c', headword: '行く', reading: 'いく', senses: [['to go', 'to move (towards)']] },
  { id: '0d', headword: '家庭', reading: 'かてい', senses: [['home', 'household']] },
  { id: '0e', headword: '家', reading: 'いえ', senses: [['house'], ['home']] },
  { id: '0f', headword: 'この', reading: 'この', senses: [['this']] },
  { id: '1b', headword: '閻魔', reading: 'えんま', senses: [['Yama']], fingerprint: 'e0' },
  { id: '1a', headword: '閻魔', reading: 'えんま', senses: [['Yama']], fingerprint: 'e0' }
]

const used: [word: string, place: number, entry: string][] = [
  ['pen', 0, '0b'],
  ['pen', 1, '0a'],
  ['went', 0, '0c'],
  ['home', 0, '0e'],
  ['yama', 0, '1a'],
  ['zebra', 0, 'ff']
]

const schema = `
  CREATE TABLE entries (
    id BLOB PRIMARY KEY, source_record_id INTEGER NOT NULL, headword TEXT NOT NULL,
    reading TEXT NOT NULL, summary TEXT NOT NULL, parts_of_speech_json TEXT NOT NULL,
    semantic_fingerprint BLOB NOT NULL
  );
  CREATE TABLE forms (entry_id BLOB NOT NULL, form TEXT NOT NULL, kind INTEGER NOT NULL);
  CREATE TABLE gloss_atoms (
    entry_id BLOB NOT NULL, sense_order INTEGER NOT NULL, gloss_order INTEGER NOT NULL,
    text TEXT NOT NULL, normalized_text TEXT NOT NULL
  );
  CREATE TABLE canonical_senses (entry_id BLOB NOT NULL, sense_order INTEGER NOT NULL);
  CREATE TABLE sense_form_restrictions (
    entry_id BLOB NOT NULL, sense_order INTEGER NOT NULL, kind INTEGER NOT NULL, form TEXT NOT NULL
  );
  CREATE TABLE form_priority_profiles (
    entry_id BLOB NOT NULL, form TEXT NOT NULL, kind INTEGER NOT NULL,
    primary_mask INTEGER NOT NULL, secondary_mask INTEGER NOT NULL, news_frequency_band INTEGER
  );
  CREATE VIRTUAL TABLE dictionary_gloss_fts USING fts4(
    normalized_text, content='gloss_atoms', tokenize=porter
  );
  CREATE VIRTUAL TABLE dictionary_form_fts USING fts4(form, content='forms', tokenize=simple);
`

const wordIndexSchema = `
  ATTACH DATABASE ':memory:' AS word_index;
  CREATE TABLE word_index.english_word_entries (
    word TEXT NOT NULL, place INTEGER NOT NULL, entry_id BLOB NOT NULL,
    PRIMARY KEY (word, place)
  ) WITHOUT ROWID;
`

function dictionary(options: { wordIndex: boolean }): SearchDatabase {
  const database = new DatabaseSync(':memory:')
  database.exec(schema)
  for (const [order, { id, headword, reading, senses, fingerprint }] of entries.entries()) {
    const summary = senses.flat().join('; ')
    database
      .prepare("INSERT INTO entries VALUES (unhex(?), ?, ?, ?, ?, '[]', unhex(?))")
      .run(id, order + 1, headword, reading, summary, fingerprint ?? id)
    database.prepare('INSERT INTO forms VALUES (unhex(?), ?, 1)').run(id, reading)
    for (const [sense, glosses] of senses.entries()) {
      database.prepare('INSERT INTO canonical_senses VALUES (unhex(?), ?)').run(id, sense)
      for (const [place, gloss] of glosses.entries()) {
        database
          .prepare('INSERT INTO gloss_atoms VALUES (unhex(?), ?, ?, ?, ?)')
          .run(id, sense, place, gloss, gloss.toLowerCase())
      }
    }
  }
  database.exec(`
    INSERT INTO dictionary_gloss_fts(dictionary_gloss_fts) VALUES('rebuild');
    INSERT INTO dictionary_form_fts(dictionary_form_fts) VALUES('rebuild');
  `)
  if (options.wordIndex) {
    database.exec(wordIndexSchema)
    for (const row of used) {
      database
        .prepare('INSERT INTO word_index.english_word_entries VALUES (?, ?, unhex(?))')
        .run(...row)
    }
  }
  return {
    async all<Row>(sql: string, params: readonly (string | number)[]) {
      return database.prepare(sql).all(...params) as Row[]
    }
  }
}

const db = dictionary({ wordIndex: true })

const headwords = (found: Map<string, { headword: string }>) =>
  Object.fromEntries([...found].map(([word, entry]) => [word, entry.headword]))

function candidates(results: SearchResults): string[][] {
  const words: string[][] = []
  for (const { sourceOrder, entry } of results.items) {
    words[sourceOrder] = [...(words[sourceOrder] ?? []), entry.headword]
  }
  return words
}

describe('the entries example sentences use for English words', () => {
  test('are, for each word, the first the word index lists, and none for a word it leaves out', async () => {
    expect(headwords(await entriesExamplesUse(db, ['this', 'pen', 'went', 'the']))).toEqual({
      pen: 'ペン',
      went: '行く'
    })
  })

  test('are none where no word index is attached, or for no words', async () => {
    expect(await entriesExamplesUse(dictionary({ wordIndex: false }), ['pen'])).toEqual(new Map())
    expect(await entriesExamplesUse(db, [])).toEqual(new Map())
  })

  test('leave out a word whose entry the dictionary does not hold', async () => {
    expect(await entriesExamplesUse(db, ['zebra'])).toEqual(new Map())
  })
})

describe('the entry example sentences use for a word', () => {
  const listed = async (word: string) => {
    const entry = (await entriesExamplesUse(db, [word])).get(word)
    if (!entry) throw new Error(`The word index has no ${word}`)
    return candidatesFromExamples(db, word, entry)
  }

  test('is listed alone, with the meaning that is the word, as the word’s own search ranks it', async () => {
    const pen = (await rankedByStrongGloss(db, 'pen')).find(
      ranked => ranked.entry.headword === 'ペン'
    )
    expect(await listed('pen')).toEqual([
      {
        entry: pen?.entry,
        sourceOrder: 0,
        matchRank: pen?.presentationRank,
        fallbackOrder: 0,
        matchedSummary: 'pen'
      }
    ])
  })

  test('is listed with its later sense when that is the one that means the word', async () => {
    const [home] = await listed('home')
    expect(home).toMatchObject({ entry: { headword: '家' }, matchedSummary: 'home' })
    expect(matchLabel(0, home.matchRank)).toBe('source=0 english strongGloss romaji=0 sense=later')
  })

  test('is listed with its own summary when no meaning of it is the word', async () => {
    const [went] = await listed('went')
    expect(went).toMatchObject({
      entry: {
        id: '0c',
        sourceRecordId: 3,
        headword: '行く',
        reading: 'いく',
        summary: 'to go; to move (towards)'
      },
      matchedSummary: null
    })
    expect(matchLabel(0, went.matchRank)).toBe('source=0 english exampleSentences romaji=0')
  })

  test('is the lower of two Language Reference IDs JMdict lists a word under, as a search names it', async () => {
    expect(await listed('yama')).toMatchObject([{ entry: { id: '1a' }, matchedSummary: 'Yama' }])
  })
})

describe('an English sentence', () => {
  test('lists the entry its examples use for a word, and for the others what the dictionary means by them', async () => {
    const results = await new DictionarySearch(db).search('This pen went home.')
    expect(candidates(results)).toEqual([['この'], ['ペン'], ['行く'], ['家']])
    expect(results.items.map(item => item.matchedSummary)).toEqual(['this', 'pen', null, 'home'])
    expect(results).toMatchObject({ presentation: 'discoveredWords', resolution: 'analyzed' })
  })

  test('lists every entry that means a word where no word index is attached', async () => {
    const results = await new DictionarySearch(dictionary({ wordIndex: false })).search(
      'This pen, home.'
    )
    expect(candidates(results)).toEqual([['この'], ['ペン', '書く'], ['家庭']])
  })
})
