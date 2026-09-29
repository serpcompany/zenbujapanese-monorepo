import { kanjiWords as orderKanjiWords } from '../detail/kanji'
import type {
  ExampleCountRow,
  ExampleSentenceRow,
  KanjiRows,
  KanjiWordRow,
  WordExampleRow,
  WordRows
} from '../detail/rows'
import exampleCounts from './example-counts.json'
import exampleSentences from './example-sentences.json'
import kanji from './kanji.json'
import kanjiWords from './kanji-words.json'
import wordExamples from './word-examples.json'
import words from './words.json'

/**
 * Local fixture rows, never used in production: twelve words and the kanji 要, exported from the
 * app's bundled data by scripts/export-dictionary-fixtures.py in the detail core's row shapes,
 * with each word's first 50 examples from the import's own precompute.
 */

const sentencesById = new Map(
  (exampleSentences as ExampleSentenceRow[]).map(sentence => [sentence.id, sentence])
)
const countsBySeq = new Map(
  (exampleCounts as (ExampleCountRow & { entSeq: number })[]).map(({ entSeq, ...count }) => [
    entSeq,
    count
  ])
)

export const fixtureWordRows: WordRows[] = (
  words as Omit<WordRows, 'examples' | 'exampleCount'>[]
).map(rows => ({
  ...rows,
  examples: (wordExamples as WordExampleRow[])
    .filter(example => example.entSeq === rows.entry.entSeq)
    .map(example => ({
      example,
      sentence: sentencesById.get(example.sentenceId) as ExampleSentenceRow
    })),
  exampleCount: countsBySeq.get(rows.entry.entSeq) ?? null
}))

/**
 * Every entry in the fingerprint groups `kanjiCandidateRowsSQL` reads for each fixture kanji,
 * which `kanjiWords` orders; the dictionary database stores the ordered list instead.
 */
export const fixtureKanjiCandidates = new Map<string, KanjiWordRow[]>()
for (const { kanji: character, ...word } of kanjiWords as (KanjiWordRow & { kanji: string })[]) {
  fixtureKanjiCandidates.set(character, [...(fixtureKanjiCandidates.get(character) ?? []), word])
}

export const fixtureKanjiRows: KanjiRows[] = (kanji as Omit<KanjiRows, 'words'>[]).map(rows => ({
  ...rows,
  words: orderKanjiWords(
    rows.kanji.character,
    fixtureKanjiCandidates.get(rows.kanji.character) ?? []
  )
}))

/** The order the app lists these words for a search, with its default frequency dictionaries. */
export const fixtureSearchOrder: Record<string, number[]> = {
  いる: [1546640, 1577980, 1391500, 1465580, 1322180, 1587780],
  iru: [1546640, 1577980, 1391500, 1465580, 1322180, 1587780],
  要: [1609600, 2188720, 1546640, 1546750, 1546680, 1546850, 1612150]
}
