import { describe, expect, test } from 'vitest'
import { segmentationFurigana } from './segmentation'

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
