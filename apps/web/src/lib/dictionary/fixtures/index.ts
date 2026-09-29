import { kanjiWords as orderKanjiWords } from '@/lib/dictionary/detail/kanji'
import type {
  ExampleRow,
  ExampleTokenRow,
  KanjiRows,
  KanjiWordRow,
  WordRows
} from '@/lib/dictionary/detail/rows'
import kanji from './kanji.json'
import kanjiWords from './kanji-words.json'
import words from './words.json'

/**
 * Local fixture rows, never used in production: twelve words and the kanji 要, exported from the
 * app's bundled data by scripts/export-dictionary-fixtures.py in the detail core's row shapes.
 * Examples are written by hand until the example pipeline (#465) exports them.
 */

const iru = (text = '要る'): ExampleTokenRow => ({
  text,
  reading: 'いる',
  isWord: true,
  isMatch: true
})

const fixtureExamples: Record<number, ExampleRow[]> = {
  1546640: [
    { tokens: [iru(), { text: '？' }], translation: 'Want it?' },
    {
      tokens: [
        { text: '車', reading: 'くるま', isWord: true },
        { text: 'が', isWord: true },
        iru(),
        { text: 'の', isWord: true },
        { text: '？' }
      ],
      translation: 'Do you want a car?'
    },
    {
      tokens: [
        { text: '両方', reading: 'りょうほう', isWord: true },
        iru(),
        { text: 'よ', isWord: true },
        { text: '。' }
      ],
      translation: 'We need both.'
    },
    {
      tokens: [
        { text: '金', isWord: true },
        { text: 'が', isWord: true },
        iru(),
        { text: 'んだ', isWord: true },
        { text: '。' }
      ],
      translation: 'I need money.'
    },
    {
      tokens: [
        { text: 'これ', isWord: true },
        iru(),
        { text: 'んだっけ', isWord: true },
        { text: '？' }
      ],
      translation: 'Do I need this?'
    },
    {
      tokens: [
        { text: '夫', reading: 'おっと', isWord: true },
        { text: 'が', isWord: true },
        iru(),
        { text: '。' },
        { text: '今', reading: 'いま', isWord: true },
        { text: 'すぐ', isWord: true },
        { text: '。' }
      ],
      translation: 'I want my husband. Now.'
    }
  ]
}

export const fixtureWordRows: WordRows[] = (words as WordRows[]).map(rows => ({
  ...rows,
  examples: fixtureExamples[rows.entry.entSeq] ?? []
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
