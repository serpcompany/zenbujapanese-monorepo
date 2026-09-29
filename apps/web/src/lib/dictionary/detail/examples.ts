// A word page's examples, as the app's Word Detail shows them (ExampleSentencesView.swift's
// `.wordDetail` presentation, LinkedJapaneseText.swift): each word of the sentence underlined and
// linked, the page's own word accented, furigana over linked words only, a speaker button, and
// the translation. The import precomputes which entry each word links to on each page
// (scripts/release-d1/dictionary/build-examples.mts); this only shapes those rows.

import { type RomajiToken, romanizeCompleteSentence, toLatin } from './romaji'
import type {
  ExampleCountRow,
  ExampleSentenceRow,
  ExampleSentenceTokenRow,
  FormExampleRows,
  WordExampleRow,
  WordExampleRows
} from './rows'
import { type RubySegment, rubySegments } from './ruby'
import { katakana } from './text'

/** How many examples a page shows at first, and loads at a time as it scrolls. */
export const examplesPerPage = 25

/**
 * Where a word links: its one entry, or, for a word the app can't resolve to one entry (such as
 * だ), a choice among `entSeqs`, which the website offers as a search for `query`.
 */
export type ExampleLink = { entSeq: number } | { entSeqs: number[]; query: string }

export interface ExampleToken {
  text: string
  /** Furigana only over a word linked to one entry, as the app draws it. */
  ruby: RubySegment[]
  link: ExampleLink | null
  /**
   * The page's own word, which the app accents: the word on its word page, and the words that make
   * up the form on a conjugated form's screen.
   */
  isPageWord: boolean
  /** A particle, auxiliary, or symbol, which shows no meaning under itself. */
  functionWord: boolean
}

/** One side of a Tatoeba pair: each sentence has its own ID, contributor, and license. */
export interface TatoebaSentence {
  id: number
  /** Null when Tatoeba names no contributor. */
  contributor: string | null
  license: string
}

export interface Example {
  /** The example's place in the word's list, from 0. */
  position: number
  /** The Tatoeba pair's ID in the artifact, lowercase hex (the app's ID is `esp1_` and this). */
  pairId: string
  /** The sentence as plain text, for speech. */
  text: string
  tokens: ExampleToken[]
  /**
   * The sentence in romaji, shown under it with Romaji on; null when a word can't be romanized,
   * and the page says so instead (`romajiUnavailable`).
   */
  romaji: string | null
  translation: string
  japanese: TatoebaSentence
  english: TatoebaSentence
}

/** What an example's page adds to its sentence: a word page's or a form screen's row. */
type ExampleRow = Pick<WordExampleRow, 'position' | 'highlights' | 'links'> & {
  tokens?: ExampleSentenceTokenRow[] | null
}

/** One example as its page shows it. */
export function wordExample(rows: WordExampleRows): Example {
  return example(rows)
}

/**
 * One of a conjugated form's examples as its screen shows it (ConjugatedFormView's examples, the
 * `.conjugatedForm` presentation): the same row, with the form's words accented.
 */
export function formExample(rows: FormExampleRows): Example {
  return example(rows)
}

function example({
  sentence,
  example
}: {
  sentence: ExampleSentenceRow
  example: ExampleRow
}): Example {
  const tokens = example.tokens ?? sentence.tokens
  const links = new Map(example.links.map(link => [link.token, link]))
  const highlights = new Set(example.highlights)
  return {
    position: example.position,
    pairId: sentence.pairId,
    text: sentence.japanese,
    tokens: tokens.map((token, index) => {
      const link = links.get(index)
      const entry = link?.entSeqs.length === 1 ? link.entSeqs[0] : null
      const reading = link?.reading ?? token.reading
      return {
        text: token.text,
        ruby:
          entry !== null && reading ? rubySegments(token.text, reading) : [{ text: token.text }],
        link: link
          ? entry !== null
            ? { entSeq: entry }
            : { entSeqs: link.entSeqs, query: token.dictionaryForm ?? token.text }
          : null,
        isPageWord: highlights.has(index),
        functionWord: token.functionWord === true
      }
    }),
    romaji: romanizeCompleteSentence(tokens.map(romajiReading)),
    translation: sentence.english,
    japanese: {
      id: sentence.japaneseTatoebaId,
      contributor: sentence.japaneseContributor,
      license: sentence.japaneseLicense
    },
    english: {
      id: sentence.englishTatoebaId,
      contributor: sentence.englishContributor,
      license: sentence.englishLicense
    }
  }
}

/**
 * The reading `romanizeCompleteSentence` reads for a token: Kuromoji's, which the row keeps as
 * `kana` where it romanizes differently from the furigana (`reading`, in hiragana), or, for a
 * word without kanji, from the surface.
 */
export function romajiReading(row: ExampleSentenceTokenRow): RomajiToken {
  return {
    surface: row.text,
    reading: row.kana ?? (row.reading === undefined ? undefined : katakana(row.reading))
  }
}

/** `JapaneseTextToken.isFunctionWord`: particles, auxiliaries, and symbols. */
export function isFunctionWord(partOfSpeech: readonly string[]): boolean {
  return ['助詞', '助動詞', '記号', '補助記号'].includes(partOfSpeech[0] ?? '')
}

/**
 * Kuromoji's reading (the surface when it has none), for a token to keep as `kana` because the
 * furigana `reading`, or without one the surface, would romanize differently; undefined when it
 * wouldn't. The imports store it, so sentence romaji reads what the app reads.
 */
export function keptKana(
  surface: string,
  parserReading: string,
  reading: string | undefined
): string | undefined {
  const kana = parserReading && parserReading !== '*' ? parserReading : surface
  const implied = romajiReading({ text: surface, reading })
  return toLatin(kana) !== toLatin(implied.reading ?? implied.surface) ? kana : undefined
}

/** What a sentence shows under itself, with Romaji on, when a word can't be romanized. */
export const romajiUnavailable = 'Romaji unavailable for this text'

/**
 * How many examples the word has, in words: the number the page lists, noting when the app
 * found more than it lists (it lists at most 100). Null for a word without examples.
 */
export function exampleCountText(count: ExampleCountRow | null): string | null {
  if (!count || count.listed === 0) return null
  if (count.truncated) return `The first ${count.listed} of more than ${count.listed} examples`
  return count.listed === 1 ? '1 example' : `${count.listed} examples`
}

/** The app's empty state (WordDetailView's ExampleSentenceSections). */
export const noExamplesMessage = 'No source-matched examples'

/** A conjugated form's screen's empty state (ConjugatedFormView's ExampleSentenceSections). */
export const noFormExamplesMessage = 'No example sentences use this form yet.'

/** A Tatoeba sentence's own page. */
export const tatoebaSentenceUrl = (id: number) => `https://tatoeba.org/en/sentences/show/${id}`

/** The licenses Tatoeba sentences carry, by the name the artifact records. */
const licenseUrls: Record<string, string> = {
  'CC BY 2.0 FR': 'https://creativecommons.org/licenses/by/2.0/fr/',
  'CC0 1.0': 'https://creativecommons.org/publicdomain/zero/1.0/'
}

export const licenseUrl = (license: string): string | null => licenseUrls[license] ?? null
