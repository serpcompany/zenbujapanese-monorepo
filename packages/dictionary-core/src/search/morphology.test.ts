import { describe, expect, test } from 'vitest'
import { analyzedWords, isOneWordPhrase, lookupSegments, type MorphologyWord } from './morphology'
import { morphemes } from './morphology.fixture'

describe('analyzedWords', () => {
  const words = morphemes([
    ['日本語', '日本語', '名詞'],
    ['を', 'を', '助詞'],
    ['勉強', '勉強', '名詞']
  ])
  const pieces = [
    ...morphemes([
      ['日本', '日本', '名詞'],
      ['語', '語', '名詞'],
      ['を', 'を', '助詞']
    ]),
    ...morphemes([['勉強', '勉強', '名詞']], 4)
  ]

  test('gives each word the pieces inside it, in order, as the app grouped Mode A under Mode C', () => {
    expect(
      analyzedWords({ words, pieces }).map(word => [
        word.surface,
        word.pieces.map(piece => piece.surface)
      ])
    ).toEqual([
      ['日本語', ['日本', '語']],
      ['を', ['を']],
      ['勉強', ['勉強']]
    ])
  })

  test('gives a word no pieces when the analyzer splits only one way, as the service does', () => {
    expect(analyzedWords({ words }).map(word => word.pieces)).toEqual([[], [], []])
  })

  test('keeps every field the analyzer gave, whether or not the words tile the text', () => {
    const [first] = analyzedWords({ words: [{ ...words[0], begin: 5, end: 2, reading: '' }] })
    expect(first).toEqual({ ...words[0], begin: 5, end: 2, reading: '', pieces: [] })
  })
})

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

  test('keeps adverbs, pre-noun words, and conjunctions, which a learner looks up as words', () => {
    expect(
      lookupSegments([
        word('すこし', 'すこし', '副詞'),
        word('この', 'この', '連体詞'),
        word('そして', 'そして', '接続詞'),
        word('おくれる', 'おくれる', '動詞'),
        word('か', 'か', '助詞'),
        word('も', 'も', '助詞')
      ])
    ).toEqual(['すこし', 'この', 'そして', 'おくれる'])
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

describe('isOneWordPhrase', () => {
  test('is one word looked up with only particles, endings, and punctuation around it', () => {
    expect(
      isOneWordPhrase([
        word('遅れる', '遅れる', '動詞'),
        word('か', 'か', '助詞'),
        word('も', 'も', '助詞')
      ])
    ).toBe(true)
    expect(
      isOneWordPhrase([
        word('夜', '夜', '名詞'),
        word('です', 'です', '助動詞'),
        word('。', '。', '補助記号')
      ])
    ).toBe(true)
  })

  test('is not two words, a lone prefix or suffix, a word beside one the analyzer didn’t know, or a word split by a space', () => {
    expect(isOneWordPhrase([word('この', 'この', '連体詞'), word('本', '本', '名詞')])).toBe(false)
    expect(
      isOneWordPhrase([word('髙橋', '髙橋', '名詞', true), word('さん', 'さん', '接尾辞')])
    ).toBe(false)
    expect(isOneWordPhrase([word('お', 'お', '接頭辞'), word('か', 'か', '助詞')])).toBe(false)
    expect(
      isOneWordPhrase([
        word('あ', 'あ', '感動詞'),
        word(' ', ' ', '空白'),
        word('い', 'い', '助詞')
      ])
    ).toBe(false)
    expect(isOneWordPhrase([word('か', 'か', '助詞')])).toBe(false)
  })
})
