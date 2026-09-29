import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import type {
  EntryRow,
  ExampleLinkRow,
  ExampleSentenceRow,
  KanjiElementRow,
  KanjiGlossRow,
  KanjiRow,
  KanjiStrokesRow,
  KanjiStructureRow,
  KanjiWordRow,
  WordExampleRow
} from '../lib/dictionary/detail/rows'
import type {
  elementGlyphs,
  exampleSentences,
  kanji,
  kanjiElements,
  kanjiStrokes,
  wordExamples,
  words
} from './dictionary-schema'

// Type checks, run by `pnpm typecheck`: a selected row fills the detail core's rows as it is, so
// the dictionary database can't drift from what the pages read.
type Word = typeof words.$inferSelect
const fills = {
  entry: (row: Word): EntryRow => row,
  // Whether a written form contains the kanji depends on the page, so the page adds it.
  kanjiWord: (row: Word): Omit<KanjiWordRow, 'containsKanji'> => row,
  kanji: (row: typeof kanji.$inferSelect): KanjiRow => row,
  kanjiGloss: (row: typeof kanji.$inferSelect): KanjiGlossRow => row,
  structure: (row: typeof kanjiElements.$inferSelect): KanjiStructureRow => row,
  strokes: (row: typeof kanjiStrokes.$inferSelect): KanjiStrokesRow => row,
  element: (row: typeof elementGlyphs.$inferSelect): KanjiElementRow => row,
  exampleSentence: (row: typeof exampleSentences.$inferSelect): ExampleSentenceRow => row,
  wordExample: (row: typeof wordExamples.$inferSelect): WordExampleRow => row
}

test('dictionary database rows fill the detail core rows', () => {
  expect(Object.keys(fills)).toHaveLength(9)
})

/** A token as the app records it in the word-detail conformance suite. */
interface SuiteToken {
  surface: string
  entry?: string
  candidates?: string[]
  pageWord?: boolean
}

interface WordDetailSuite {
  cases: { examples: { shown: { tokens: SuiteToken[] }[] } }[]
}

describe('word_examples links', () => {
  const suite: WordDetailSuite = JSON.parse(
    readFileSync(
      new URL('../../../ios/LanguageData/Conformance/word-detail.json', import.meta.url),
      'utf8'
    )
  )
  const sentences = suite.cases.flatMap(entry => entry.examples.shown)
  const tokens = sentences.flatMap(sentence => sentence.tokens)

  test('the app resolves a token to one entry or to several candidates, never both', () => {
    expect(tokens.filter(token => token.entry && token.candidates)).toEqual([])
    expect(tokens.filter(token => token.candidates && token.candidates.length < 2)).toEqual([])
    expect(tokens.filter(token => token.pageWord && !token.entry)).toEqual([])
    expect(tokens.filter(token => token.candidates).length).toBeGreaterThan(0)
  })

  test('store every recorded token and read it back unchanged', () => {
    // The suite names entries by Language Reference ID; the database by ent_seq.
    const entSeqs = new Map<string, number>()
    const ids = new Map<number, string>()
    const entSeq = (id: string) => {
      const known = entSeqs.get(id)
      if (known !== undefined) return known
      entSeqs.set(id, entSeqs.size)
      ids.set(entSeqs.size - 1, id)
      return entSeqs.size - 1
    }

    for (const sentence of sentences) {
      const links: ExampleLinkRow[] = []
      const highlights: number[] = []
      sentence.tokens.forEach((token, index) => {
        const linked = token.entry ? [token.entry] : (token.candidates ?? [])
        if (linked.length > 0) links.push({ token: index, entSeqs: linked.map(entSeq) })
        if (token.pageWord) highlights.push(index)
      })
      const read = sentence.tokens.map((token, index): SuiteToken => {
        const link = links.find(candidate => candidate.token === index)
        const linked = link?.entSeqs.map(number => ids.get(number) ?? '') ?? []
        return {
          surface: token.surface,
          ...(linked.length === 1 ? { entry: linked[0] } : {}),
          ...(linked.length > 1 ? { candidates: linked } : {}),
          ...(highlights.includes(index) ? { pageWord: true } : {})
        }
      })
      expect(read).toEqual(sentence.tokens)
    }
  })
})
