import { DatabaseSync } from 'node:sqlite'
import { describe, expect, test, vi } from 'vitest'
import { FormKind } from './database'
import { rankedByStrongGloss, rankedEnglish } from './english'
import type { MorphologyWord } from './morphology'
import { EvidenceLane } from './rank'
import { DictionarySearch, type SearchDatabase, type SearchResults } from './search'

interface Word {
  headword: string
  reading: string
  romaji: string
  meanings: string[]
  isCommon?: boolean
}

const learnerPriority = 2

function dictionary(words: readonly Word[]): SearchDatabase {
  const database = new DatabaseSync(':memory:')
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

const word = (headword: string, reading: string, romaji: string, ...meanings: string[]): Word => ({
  headword,
  reading,
  romaji,
  meanings
})

const db = dictionary([
  word('何処', 'どこ', 'doko', 'where', 'what place'),
  word('だ', 'だ', 'da', 'be', 'is'),
  word('その', 'その', 'sono', 'that', 'the'),
  word('風呂', 'ふろ', 'furo', 'bath', 'bathroom'),
  word('浴室', 'よくしつ', 'yokushitsu', 'bathroom', 'bath'),
  word('お陰様で', 'おかげさまで', 'okagesamade', 'thanks to his help'),
  word('アイスクリーム', 'アイスクリーム', 'aisukuri-mu', 'ice cream'),
  word('氷', 'こおり', 'koori', 'ice'),
  word('クリーム', 'クリーム', 'kuri-mu', 'cream'),
  word('お冷や', 'おひや', 'ohiya', 'water'),
  { ...word('水', 'みず', 'mizu', 'water'), isCommon: true },
  word('握り', 'にぎり', 'nigiri', 'sushi'),
  word('寿司', 'すし', 'sushi', 'sushi'),
  word('日本語', 'にほんご', 'nihongo', 'Japanese (language)'),
  word('勉強', 'べんきょう', 'benkyou', 'study'),
  word('する', 'する', 'suru', 'to do')
])

const listed = (results: SearchResults) => results.items.map(item => item.entry.headword)

describe('an English sentence', () => {
  const search = new DictionarySearch(db)

  test('lists the word each of its words means, small words included, in the sentence’s order (#401)', async () => {
    const results = await search.search('Where is the bathroom?')
    expect(listed(results)).toEqual(['何処', 'だ', 'その', '浴室'])
    expect(results.items.map(item => item.matchedSummary)).toEqual([
      'where',
      'is',
      'the',
      'bathroom'
    ])
    expect(results).toMatchObject({ presentation: 'discoveredWords', resolution: 'analyzed' })
  })

  test.each([
    'bathroom',
    'water',
    'sushi'
  ])('lists for 「%s」 the word its own search ranks first', async meaning => {
    const [first] = (await search.search(meaning)).items
    const sentence = await search.search(`the ${meaning}`)
    expect(listed(sentence)).toEqual(['その', first.entry.headword])
  })

  test.each([
    'where',
    'is',
    'bathroom',
    'water',
    'sushi',
    'his',
    'do',
    'japanese'
  ])('ranks the words that mean 「%s」 as that word’s search ranks them', async meaning => {
    const searched = (await rankedEnglish(db, meaning)).filter(
      ranked => ranked.rank.kind === 'english' && ranked.rank.lane === EvidenceLane.strongGloss
    )
    expect(await rankedByStrongGloss(db, meaning)).toEqual(searched)
  })

  test('leaves out a word that no entry means, though an entry mentions it', async () => {
    expect(listed(await search.search('his'))).toEqual(['お陰様で'])
    expect(listed(await search.search('where is his xyzzy bathroom'))).toEqual([
      '何処',
      'だ',
      '浴室'
    ])
  })

  test('lists once a word that two of its words mean, and once a word it repeats', async () => {
    expect(listed(await search.search('is that the bathroom, the bathroom?'))).toEqual([
      'だ',
      'その',
      '浴室'
    ])
  })

  test('is searched as itself when an entry means the whole of it', async () => {
    const results = await search.search('ice cream')
    expect(listed(results)).toEqual(['アイスクリーム'])
    expect(results).toMatchObject({ presentation: 'ranked', resolution: 'direct' })
  })

  test.each([
    ['one of its words alone has an entry', 'the xyzzy'],
    ['it is one word', 'bathroom?'],
    ['it holds a wildcard, which makes it a pattern', 'where is the bathr*'],
    ['it holds FTS4’s first-word mark', '^where is the bathroom']
  ])('lists nothing when %s', async (_, query) => {
    expect(await search.search(query)).toMatchObject({ items: [], presentation: 'ranked' })
  })

  test('needs no analyzer and asks none', async () => {
    const analyze = vi.fn(async (): Promise<MorphologyWord[]> => [])
    const analyzing = new DictionarySearch(db, { morphology: { analyze } })
    expect(listed(await analyzing.search('where is the bathroom'))).toHaveLength(4)
    expect(analyze).not.toHaveBeenCalled()
  })
})

describe('a long English sentence', () => {
  const made = (count: number, ending: string) =>
    Array.from({ length: count }, (_, index) => `${String.fromCharCode(97 + index)}${ending}`)
  const known = made(13, 'ux')
  const unknown = made(24, 'oz')
  const search = new DictionarySearch(
    dictionary(known.map(meaning => word(meaning.toUpperCase(), meaning, meaning, meaning)))
  )

  test('lists its first twelve words that have an entry', async () => {
    const results = await search.search(known.join(' '))
    expect(listed(results)).toEqual(known.slice(0, 12).map(meaning => meaning.toUpperCase()))
  })

  test('looks up its first twenty-four words and no more', async () => {
    const [first, second] = known
    const within = [...unknown.slice(0, 22), first, second].join(' ')
    const beyond = [...unknown.slice(0, 23), first, second].join(' ')
    expect(listed(await search.search(within))).toEqual([first, second].map(m => m.toUpperCase()))
    expect(listed(await search.search(beyond))).toEqual([])
  })
})

describe('a sentence', () => {
  const analyzed = [
    ['日本語', '名詞'],
    ['を', '助詞'],
    ['勉強', '名詞'],
    ['する', '動詞']
  ].map(
    ([surface, partOfSpeech]): MorphologyWord => ({
      surface,
      dictionaryForm: surface,
      partOfSpeech: [partOfSpeech],
      isOutOfVocabulary: false
    })
  )

  test.each([
    ['日本語を勉強する', ['日本語', '勉強', 'する']],
    ['I do study Japanese.', ['する', '勉強', '日本語']]
  ])('lists its words as Discovered Words in Japanese and in English: 「%s」', async (sentence, words) => {
    const search = new DictionarySearch(db, { morphology: { analyze: async () => analyzed } })
    const results = await search.search(sentence)
    expect(listed(results)).toEqual(words)
    expect(results).toMatchObject({ presentation: 'discoveredWords', resolution: 'analyzed' })
  })
})
