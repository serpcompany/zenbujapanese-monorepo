import { DatabaseSync } from 'node:sqlite'
import { describe, expect, test } from 'vitest'
import { phraseOffsets, phraseQuery, tokenize } from './fts4'
import {
  englishFtsQuery,
  exampleSearchKey,
  type SearchSentence,
  searchExamples,
  stemsDocument
} from './search'

// The app's direct example search (ExampleSentenceClient.swift's retrieveEnglish and
// retrieveJapanese) over a small corpus. The example-search suite checks it on the whole corpus.

const sentence = (id: number, japanese: string, english: string): SearchSentence => ({
  id,
  pairId: id.toString(16).padStart(32, '0'),
  japanese,
  english
})

const corpus = [
  sentence(1, '彼は食べている。', 'He is eating.'),
  sentence(2, '私は食べる。', 'I eat.'),
  sentence(3, '猫が魚を食べた。', 'The cat ate fish; cats eat fish.'),
  sentence(4, '食べなさい。', 'Eat!'),
  sentence(5, 'それを取って。それは何？', 'Take it. Is it yours?'),
  sentence(6, 'はい。', 'Yes.'),
  sentence(7, 'はい、そうです。', 'Yes, it is.')
]

/** Every sentence, as a source that finds more than matches. */
const everything = {
  english: async () => corpus,
  japanese: async () => corpus
}

describe('searchExamples', () => {
  test('lists exact English words first, then Porter matches, each by where they match', async () => {
    // "eat" is exact in 2, 3 (at 22), and 4; "eating" matches only through Porter.
    expect(await searchExamples('eat', everything)).toEqual({
      ids: [4, 2, 3, 1],
      count: 4,
      truncated: false
    })
  })

  test('lists nothing when no sentence has the exact words', async () => {
    expect(await searchExamples('eats', everything)).toEqual({
      ids: [],
      count: 0,
      truncated: false
    })
  })

  test("doesn't match a phrase across the end of a sentence", async () => {
    expect((await searchExamples('it is', everything)).ids).toEqual([7])
  })

  test('refuses a query with a quote or no words, as the app does', async () => {
    for (const query of ['"eat"', '!!!']) {
      expect(await searchExamples(query, everything)).toEqual({
        ids: [],
        count: 0,
        truncated: false
      })
    }
  })

  test('lists a whole Japanese sentence first, then others by where the query is', async () => {
    expect((await searchExamples('はい。', everything)).ids).toEqual([6])
    expect((await searchExamples('食べ', everything)).ids).toEqual([4, 2, 1, 3])
  })

  test('counts up to 50, then 51 for more, and lists at most 100', async () => {
    const many = Array.from({ length: 120 }, (_, index) => sentence(index + 1, '犬。', 'A dog.'))
    const source = { english: async () => many, japanese: async () => many }
    expect(await searchExamples('dog', source)).toMatchObject({ count: 51, truncated: true })
    expect((await searchExamples('犬', source)).ids).toHaveLength(100)
  })
})

describe('the website’s index', () => {
  test('spells each Porter term in hex, and a query finds exactly its phrase', () => {
    expect(stemsDocument([{ term: 'eat' }, { term: 'fish' }])).toBe('x656174 x66697368')
    expect(englishFtsQuery(phraseQuery('eating fish', 'porter'))).toBe('"x656174 x66697368"')
    expect(englishFtsQuery(phraseQuery('fish eat*', 'porter'))).toBe('"x66697368 x656174"*')
    // FTS5 allows a prefix only at a string's end; `+` joins the next.
    expect(englishFtsQuery(phraseQuery('ea* fish', 'porter'))).toBe('"x6561"* + "x66697368"')
    expect(englishFtsQuery(phraseQuery('^the cat', 'porter'))).toBe('^"x746865 x636174"')
    // FTS4 requires a later ^ word to be first, which no sentence has.
    expect(englishFtsQuery(phraseQuery('the ^cat', 'porter'))).toBeNull()
  })

  test('the FTS5 query matches what FTS4 matches, first words and prefixes included', () => {
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec("CREATE VIRTUAL TABLE f USING fts5(stems, content='', tokenize='ascii')")
    const texts = ['The cat eats.', 'A cat, the eater.', 'The cats ate the eel.', 'Eat the cat!']
    for (const [index, text] of texts.entries()) {
      sqlite
        .prepare('INSERT INTO f(rowid, stems) VALUES (?, ?)')
        .run(index, stemsDocument(tokenize(text, 'porter')))
    }
    for (const query of ['the cat', '^the', '^the cat*', 'ea*', 'the ea*', 'ca* the', 'cat']) {
      const phrase = phraseQuery(query, 'porter')
      const fts5 = sqlite
        .prepare('SELECT rowid FROM f WHERE f MATCH ? ORDER BY rowid')
        .all(englishFtsQuery(phrase) ?? '')
        .map(row => Number(row.rowid))
      const fts4 = texts.flatMap((text, index) =>
        phraseOffsets(phrase, tokenize(text, 'porter')).length > 0 ? [index] : []
      )
      expect(fts5, query).toEqual(fts4)
    }
  })

  test('precomputes queries that tokenize alike under one key', () => {
    expect(exampleSearchKey("I'm")).toBe(exampleSearchKey('i m'))
    expect(exampleSearchKey('eating')).not.toBe(exampleSearchKey('eat'))
    expect(exampleSearchKey('食べる')).toBe('食べる')
  })
})
