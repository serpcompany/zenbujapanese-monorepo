import { describe, expect, test } from 'vitest'
import { analyzedWords, usesForm } from './forms'
import type { MorphologyCandidate } from './morphology'

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
    expect(usesForm('あれを見たかった。', mitakatta, '見た')).toBe(false)
  })

  test('a failed analysis has no words, so no sentence uses the form', () => {
    expect(usesForm('猫を見た。', null, '見た')).toBe(false)
  })
})
