import { describe, expect, test } from 'vitest'
import {
  categoryIndexOf,
  categoryPath,
  kanaPath,
  pageNumber,
  rankBandPath,
  rankedListPath
} from './paths'

describe('browse URLs', () => {
  test('a list’s first page has no number, and later pages add theirs', () => {
    expect(categoryPath('onomatopoeia')).toBe('/dictionary/browse/onomatopoeia/')
    expect(categoryPath('onomatopoeia', 'used', 2)).toBe('/dictionary/browse/onomatopoeia/2/')
    expect(categoryPath('onomatopoeia', 'kana', 3)).toBe(
      '/dictionary/browse/onomatopoeia/kana-order/3/'
    )
    expect(rankedListPath('anime')).toBe('/dictionary/browse/frequency-dictionaries/anime/')
  })

  test('kana are percent-encoded', () => {
    expect(kanaPath('hiragana', 'かが', 2)).toBe(
      `/dictionary/browse/hiragana/${encodeURIComponent('かが')}/2/`
    )
  })

  test('a rank band opens the page that holds its first rank', () => {
    expect(rankBandPath('youtube', 1)).toBe('/dictionary/browse/frequency-dictionaries/youtube/')
    expect(rankBandPath('youtube', 1_001)).toBe(
      '/dictionary/browse/frequency-dictionaries/youtube/6/'
    )
  })

  test('dialects are listed with the usage labels, and common words on their own', () => {
    expect(categoryIndexOf('dialect')).toBe('usage')
    expect(categoryIndexOf('common')).toBeNull()
  })
})

describe('pageNumber', () => {
  test('reads a later page, and sends page 1 to the list’s own URL', () => {
    expect(pageNumber('2')).toEqual({ page: 2 })
    expect(pageNumber('1')).toEqual({ redirect: true })
  })

  test.each(['0', '02', 'two', '', '123456'])('finds no page in "%s"', segment => {
    expect(pageNumber(segment)).toBeNull()
  })
})
