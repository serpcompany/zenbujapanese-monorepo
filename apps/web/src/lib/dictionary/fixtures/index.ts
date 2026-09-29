import { kanjiWords as orderKanjiWords } from '@/lib/dictionary/detail/kanji'
import type {
  ExampleCountRow,
  ExampleSentenceRow,
  FormExampleRow,
  FormExampleRows,
  KanjiElementRows,
  KanjiRows,
  KanjiWordRow,
  WordExampleRow,
  WordRows
} from '@/lib/dictionary/detail/rows'
import elements from './elements.json'
import exampleCounts from './example-counts.json'
import exampleSentences from './example-sentences.json'
import formExamples from './form-examples.json'
import kanji from './kanji.json'
import kanjiWords from './kanji-words.json'
import wordExamples from './word-examples.json'
import words from './words.json'

/**
 * Local fixture rows, never used in production: twelve words, the kanji 要, and its elements, exported from the
 * app's bundled data by scripts/export-dictionary-fixtures.py in the detail core's row shapes,
 * with each word's first 50 examples, and each of its conjugated forms' first 50, from the
 * import's own precompute.
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

/** The fixture words' conjugated forms' examples, in order, by the form's spelling. */
export const fixtureFormExamples = new Map<string, FormExampleRows[]>()
for (const example of formExamples as FormExampleRow[]) {
  const rows = fixtureFormExamples.get(example.surface) ?? []
  rows.push({ example, sentence: sentencesById.get(example.sentenceId) as ExampleSentenceRow })
  fixtureFormExamples.set(example.surface, rows)
}

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

/** The elements of the fixture kanji, whose pages it links to. */
export const fixtureElementRows = elements as KanjiElementRows[]
