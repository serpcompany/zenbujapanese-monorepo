import { DatabaseSync } from 'node:sqlite'
import { describe, expect, test } from 'vitest'
import {
  type Fts4Tokenizer,
  phraseOffsets,
  phraseQuery,
  phraseRange,
  tokenCount,
  tokenize
} from './fts4'

// The port against SQLite's own FTS4, which Node's SQLite includes. The search import checks the
// tokenizers on every sentence of the corpus (scripts/release-d1/search/build-examples.mts).

const sqlite = new DatabaseSync(':memory:')
for (const tokenizer of ['simple', 'porter']) {
  sqlite.exec(`CREATE VIRTUAL TABLE tokens_${tokenizer} USING fts3tokenize(${tokenizer})`)
  sqlite.exec(`CREATE VIRTUAL TABLE docs_${tokenizer} USING fts4(english, tokenize=${tokenizer})`)
}

function sqliteTokens(text: string, tokenizer: Fts4Tokenizer) {
  // A token's bytes: FTS4 can cut a long word mid-character.
  const rows = sqlite
    .prepare(`SELECT hex(token) AS token, start, "end" FROM tokens_${tokenizer} WHERE input = ?`)
    .all(text) as { token: string; start: number; end: number }[]
  return rows.map(row => ({
    term: Buffer.from(row.token, 'hex').toString('latin1'),
    start: row.start,
    end: row.end
  }))
}

/** FTS4's own `offsets()` for a phrase query on one text. */
function sqliteOffsets(text: string, phrase: string, tokenizer: Fts4Tokenizer) {
  sqlite.exec(`DELETE FROM docs_${tokenizer}`)
  sqlite.prepare(`INSERT INTO docs_${tokenizer}(english) VALUES (?)`).run(text)
  const row = sqlite
    .prepare(`SELECT offsets(docs_${tokenizer}) AS o FROM docs_${tokenizer} WHERE english MATCH ?`)
    .get(`"${phrase}"`) as { o: string } | undefined
  if (!row) return []
  const values = row.o.split(' ').map(Number)
  const offsets = []
  for (let index = 0; index < values.length; index += 4) {
    offsets.push({
      term: values[index + 1],
      byteOffset: values[index + 2],
      byteLength: values[index + 3]
    })
  }
  return offsets
}

const sortOffsets = <T extends { term: number; byteOffset: number }>(offsets: T[]) =>
  [...offsets].sort((a, b) => a.byteOffset - b.byteOffset || a.term - b.term)

const texts = [
  'Running cats relational generalizations hopping caresses ponies ties caress cats',
  'agreed plastered motoring sing conflated troubled sized hopping tanned falling hissing',
  'fizzed failing filing happy sky relational conditional rational valenci hesitanci digitizer',
  'conformabli radicalli differentli vileli analogousli vietnamization predication operator',
  'feudalism decisiveness hopefulness callousness formaliti sensitiviti sensibiliti triplicate',
  'formative formalize electriciti electrical hopeful goodness revival allowance inference',
  'airliner gyroscopic adjustable defensible irritant replacement adjustment dependent adoption',
  'homologou communism activate angulariti homologous effective bowdlerize probate rate cease',
  'controll roll generalization oscillators yyyy yes syzygy by eyes ay',
  "I'm sure it's 9999999 dollars, 1,000 people and 12345678901234567890123 too.",
  'Long words like antidisestablishmentarianism and pneumonoultramicroscopic stay long.',
  'Snake_case, CamelCase, e-mail, U.S.A., café, naïve, “quoted” words—dashes… and “more”.',
  'The Tatoeba Project: Tom said, "Hello!" Mary replied. It is. Is it? It is!',
  'Ｆｕｌｌ-width and 日本語 mixed text with emoji 👍🏽 and tabs\tand\nnewlines',
  // A long word with digits keeps its first and last 3 bytes, cutting ⁰ in two.
  'Find the remainder when 2²⁰¹³ is divided by 3.'
]

describe('the FTS4 tokenizers', () => {
  for (const tokenizer of ['simple', 'porter'] satisfies Fts4Tokenizer[]) {
    test.each(texts)(`${tokenizer} tokenizes "%s" as SQLite does`, text => {
      expect(tokenize(text, tokenizer)).toEqual(sqliteTokens(text, tokenizer))
      expect(tokenCount(text, tokenizer)).toBe(sqliteTokens(text, tokenizer).length)
    })
  }

  test('Porter stems a word list as SQLite does', () => {
    const words = texts
      .join(' ')
      .split(/[^A-Za-z]+/)
      .filter(Boolean)
    const suffixes = [
      '',
      's',
      'es',
      'ed',
      'ing',
      'ly',
      'ness',
      'ful',
      'ation',
      'izer',
      'ement',
      'ible',
      'ous'
    ]
    const variants = words.flatMap(word => suffixes.map(suffix => `${word}${suffix}`))
    const text = variants.join(' ')
    expect(tokenize(text, 'porter')).toEqual(sqliteTokens(text, 'porter'))
  })
})

describe('phrase offsets', () => {
  const cases: [string, string, Fts4Tokenizer][] = [
    ['It is raining. It is cold.', 'it is', 'porter'],
    ['the the the', 'the the', 'porter'],
    ['He runs and running is fun; runner ran.', 'run*', 'porter'],
    ['Tom saw Tom.', '^tom', 'porter'],
    ['Tom saw Tom.', 'saw ^tom', 'porter'],
    ["I don't know. Don't go.", "don't", 'simple'],
    ['a_b a b', 'a b', 'porter'],
    ['a_b a b', 'a b', 'simple'],
    ['Numbers 9999999 and 9999990 and 99999999999', '9999999', 'porter']
  ]
  test.each(cases)('"%s" for "%s" (%s) as FTS4 reports them', (text, phrase, tokenizer) => {
    const actual = phraseOffsets(phraseQuery(phrase, tokenizer), tokenize(text, tokenizer))
    expect(sortOffsets(actual)).toEqual(sortOffsets(sqliteOffsets(text, phrase, tokenizer)))
  })
})

describe('phraseRange (ExampleSentenceClient.phraseRange)', () => {
  const range = (text: string, phrase: string) =>
    phraseRange(text, phraseOffsets(phraseQuery(phrase, 'porter'), tokenize(text, 'porter')))

  test('finds the first run of the phrase, in graphemes', () => {
    expect(range('I think it is here.', 'it is')).toEqual({ location: 8, length: 5 })
  })

  test("doesn't cross the end of a sentence", () => {
    expect(range('Take it. Is that all?', 'it is')).toBeNull()
    expect(range('Take it. Is it? It is.', 'it is')).toEqual({ location: 16, length: 5 })
  })

  test('counts graphemes before a match, as Swift counts Characters', () => {
    expect(range('👍🏽 café is open', 'is')).toEqual({ location: 7, length: 2 })
  })
})
