// Reading Aids, as the app's Account → Reading Aids sets them (ReadingAidPreferences.swift) and
// its views apply them (ReadingAidPresentation.swift): furigana, romaji, word meanings under linked
// words, and sentence translations. The website keeps the settings in the browser
// (components/reading-aids.tsx); these are the values they show.

/** A Reading Aid the website offers. Hide Furigana on Known Words waits for accounts (#468). */
export type ReadingAid = 'furigana' | 'romaji' | 'wordMeanings' | 'translations'

export type ReadingAidSettings = Record<ReadingAid, boolean>

/**
 * A new install's settings (ReadingAidPreferences' initial values): Furigana and Sentence
 * Translations on, Romaji and Word Meanings off. The word-detail suite records them
 * (`readingAidDefaults`), and a unit test holds this to it.
 */
export const readingAidDefaults: ReadingAidSettings = {
  furigana: true,
  romaji: false,
  wordMeanings: false,
  translations: true
}

/**
 * `ReadingAidPresentation.readingWithoutFurigana`: with furigana off, a headword shows its reading
 * under itself, unless it's written in its reading.
 */
export function readingWithoutFurigana(surface: string, reading: string): string | null {
  return reading !== surface ? reading : null
}

/**
 * `DictionaryEntry.shortMeaning(from:)`: a few words of the first meaning, short enough to sit
 * under the word: notes in parentheses dropped, up to the first comma, without a leading "to ",
 * and cut to 17 Characters and an ellipsis when over 18.
 */
export function shortMeaning(firstMeaning: string | null | undefined, limit = 18): string | null {
  if (firstMeaning === null || firstMeaning === undefined) return null
  const withoutNotes = firstMeaning.replace(/\s*\([^)]*\)/g, '')
  // Swift's split(separator:) leaves out empty pieces.
  const first = withoutNotes.split(',').find(piece => piece !== '') ?? withoutNotes
  let gloss = first.replace(/^[\p{Zs}\t]+|[\p{Zs}\t]+$/gu, '')
  if (gloss.startsWith('to ')) gloss = gloss.slice(3)
  if (gloss === '') return null
  const characters = Array.from(
    new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(gloss),
    s => s.segment
  )
  return characters.length > limit ? `${characters.slice(0, limit - 1).join('')}…` : gloss
}

/**
 * `ReadingAidPresentation.wordMeaning`: the meaning under a word linked to one entry, with Word
 * Meanings on, except a particle, auxiliary, or symbol. Without accounts every word is unknown,
 * as it is in the app until the learner marks it.
 */
export function wordMeaning(
  token: { functionWord: boolean },
  firstMeaning: string | null | undefined
): string | null {
  return token.functionWord ? null : shortMeaning(firstMeaning)
}
