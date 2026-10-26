import { describe, expect, test } from 'vitest'
import { isSegmentableText, maximumSegmentedLength, segmentationProblem } from './segmentable'
import { segmentationFurigana } from './segmentation'

describe('a text to segment', () => {
  test('takes 1 to 200 characters, counted by code point', () => {
    expect(maximumSegmentedLength).toBe(200)
    expect(isSegmentableText('今')).toBe(true)
    expect(isSegmentableText('あ'.repeat(maximumSegmentedLength))).toBe(true)
    expect(isSegmentableText('𠮟'.repeat(maximumSegmentedLength))).toBe(true)
    expect(isSegmentableText('あ'.repeat(maximumSegmentedLength + 1))).toBe(false)
  })

  test('refuses no text and text that is only white space, but keeps the space around words', () => {
    for (const blank of ['', ' ', '\u{3000}', '\n\t', ' \u{3000}\n']) {
      expect(isSegmentableText(blank)).toBe(false)
    }
    expect(isSegmentableText(' 今日\n')).toBe(true)
  })

  test('says which it is, a blank text before a long one, so a page can say why', () => {
    expect(segmentationProblem('')).toBe('empty')
    expect(segmentationProblem(' '.repeat(maximumSegmentedLength + 1))).toBe('empty')
    expect(segmentationProblem('あ'.repeat(maximumSegmentedLength + 1))).toBe('tooLong')
    expect(segmentationProblem('今日')).toBeNull()
  })
})

describe('segmentationFurigana', () => {
  test('puts each word’s reading over its kanji, the kana after them left bare', () => {
    expect(
      segmentationFurigana([
        { text: '今日', reading: 'きょう', languageReferenceID: 'a' },
        { text: 'は' },
        { text: '食べます', reading: 'たべます', dictionaryForm: '食べる', candidates: ['b', 'c'] }
      ])
    ).toEqual([
      { text: '今日', reading: 'きょう' },
      { text: 'は' },
      { text: '食', reading: 'た' },
      { text: 'べます' }
    ])
  })

  test('keeps every token, spaces and line breaks included, so the text reads as it was written', () => {
    const tokens = [
      { text: '東京', reading: 'とうきょう' },
      { text: '\n' },
      { text: ' ' },
      { text: 'ABC' }
    ]
    expect(
      segmentationFurigana(tokens)
        .map(segment => segment.text)
        .join('')
    ).toBe('東京\n ABC')
  })

  test('gives no reading where a token has none, or its reading is its text', () => {
    expect(segmentationFurigana([{ text: '鬱' }, { text: '〆', reading: '〆' }])).toEqual([
      { text: '鬱' },
      { text: '〆' }
    ])
  })
})
