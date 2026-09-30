import { describe, expect, test } from 'vitest'
import { analyzedWords, queryHighlights, usesForm } from './forms'
import type { MorphologyCandidate } from './morphology'

/** A Kuromoji candidate with just what grouping reads. */
const candidate = (surface: string, partOfSpeech: string[]): MorphologyCandidate => ({
  surface,
  dictionaryForm: surface,
  normalizedForm: surface,
  reading: surface,
  partOfSpeech,
  isOutOfVocabulary: false,
  children: [],
  joinsInflection: false
})

// 見たかった: the verb, then た and かった, which join it as one word.
const mitakatta = [
  candidate('あれ', ['名詞']),
  candidate('を', ['助詞']),
  candidate('見', ['動詞']),
  candidate('たかっ', ['助動詞']),
  candidate('た', ['助動詞']),
  candidate('。', ['記号'])
]
const mita = [
  candidate('猫', ['名詞']),
  candidate('を', ['助詞']),
  candidate('見', ['動詞']),
  candidate('た', ['助動詞']),
  candidate('。', ['記号'])
]

describe('a form’s examples (ConjugatedForm.examples)', () => {
  test('words join a verb with its inflection, as linked text shows them', () => {
    expect(analyzedWords(mitakatta)).toEqual(['あれ', 'を', '見たかった', '。'])
    expect(analyzedWords(null)).toEqual([])
  })

  test('a sentence uses the form only when the parser reads the form as one whole word', () => {
    expect(usesForm('猫を見た。', mita, '見た')).toBe(true)
    // 見た is inside 見たかった (wanted to see), which isn't past 見た.
    expect(usesForm('あれを見たかった。', mitakatta, '見た')).toBe(false)
    // A failed analysis has no words.
    expect(usesForm('猫を見た。', null, '見た')).toBe(false)
  })
})

describe('the words a form’s screen accents (queryScalarRanges, matchesQuery)', () => {
  test('accents each word that overlaps an occurrence of the form', () => {
    expect(queryHighlights('猫を見た。', ['猫', 'を', '見た', '。'], '見た')).toEqual([2])
    // An occurrence across two words accents both.
    expect(queryHighlights('見たい', ['見', 'たい'], '見た')).toEqual([0, 1])
    expect(queryHighlights('見た見た', ['見た', '見た'], '見た')).toEqual([0, 1])
  })

  test('counts Unicode scalars, as the app does', () => {
    expect(queryHighlights('𠀋を見た', ['𠀋', 'を', '見た'], '見た')).toEqual([2])
    // A form whose query differs from its spelling, such as Ｈ (h), accents nothing.
    expect(queryHighlights('Ｈです', ['Ｈ', 'です'], 'h')).toEqual([])
  })

  test('the words must spell the sentence', () => {
    expect(() => queryHighlights('猫を見た', ['猫', '見た'], '見た')).toThrow()
  })
})
