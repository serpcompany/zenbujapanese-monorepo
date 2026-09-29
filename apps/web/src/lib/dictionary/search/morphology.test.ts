import { describe, expect, test } from 'vitest'
import { lookupSegments, type MorphologyWord } from './morphology'

const word = (
  surface: string,
  dictionaryForm: string,
  partOfSpeech: string,
  isOutOfVocabulary = false
): MorphologyWord => ({ surface, dictionaryForm, partOfSpeech: [partOfSpeech], isOutOfVocabulary })

describe('lookupSegments', () => {
  test('keeps Japanese content words, in their dictionary forms', () => {
    expect(
      lookupSegments([
        word('日本語', '日本語', '名詞'),
        word('を', 'を', '助詞'),
        word('勉強', '勉強', '名詞'),
        word('し', 'する', '動詞'),
        word('た', 'た', '助動詞')
      ])
    ).toEqual(['日本語', '勉強', 'する'])
  })

  test('drops unknown and non-Japanese words, and keeps the surface without a dictionary form', () => {
    expect(
      lookupSegments([
        word('ほげ', 'ほげ', '名詞', true),
        word('abc', 'abc', '名詞'),
        word('猫', '*', '名詞'),
        word('犬', '', '名詞')
      ])
    ).toEqual(['猫', '犬'])
  })
})
