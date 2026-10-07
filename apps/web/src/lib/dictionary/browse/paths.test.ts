import { describe, expect, test } from 'vitest'
import {
  categoryIndexOf,
  categoryPath,
  jlptVocabularyPath,
  kanaPath,
  pageNumber,
  parseJlptLevel,
  parseRankBand,
  rankBandPath,
  rankedListPath
} from './paths'

describe('browse URLs', () => {
  test('a list’s first page has no number, and later pages add theirs', () => {
    expect(categoryPath('onomatopoeia')).toBe('/dictionary/browse/onomatopoeia/')
    expect(categoryPath('onomatopoeia', 'used', 2)).toBe('/dictionary/browse/onomatopoeia/2/')
    expect(jlptVocabularyPath(5)).toBe('/dictionary/browse/frequency-dictionaries/jlpt/n5/')
    expect(jlptVocabularyPath(1, 3)).toBe('/dictionary/browse/frequency-dictionaries/jlpt/n1/3/')
  })

  test('a JLPT level is read back from the URL its path builds', () => {
    expect(parseJlptLevel('n5')?.slug).toBe('jlpt-n5')
    expect(parseJlptLevel('n1')?.level).toBe(1)
    expect(parseJlptLevel('n6')).toBeNull()
    expect(parseJlptLevel('jlpt-n5')).toBeNull()
  })

  test('a category in kana order is its own list, beside the one most used first', () => {
    expect(categoryPath('onomatopoeia', 'kana')).toBe('/dictionary/browse/onomatopoeia/kana-order/')
    expect(categoryPath('onomatopoeia', 'kana', 3)).toBe(
      '/dictionary/browse/onomatopoeia/kana-order/3/'
    )
  })

  test('kana are percent-encoded', () => {
    expect(kanaPath('hiragana', 'かが', 2)).toBe(
      `/dictionary/browse/hiragana/${encodeURIComponent('かが')}/2/`
    )
  })

  test('a ranked list is read a band of 1,000 ranks at a time, and opens at its first band', () => {
    expect(rankBandPath('youtube', 2)).toBe(
      '/dictionary/browse/frequency-dictionaries/youtube/1001-2000/'
    )
    expect(rankedListPath('anime')).toBe('/dictionary/browse/frequency-dictionaries/anime/1-1000/')
    expect(parseRankBand('9001-10000')).toBe(10)
    expect(parseRankBand('1-1000')).toBe(1)
  })

  test.each([
    '1001-1999',
    '0-1000',
    '10001-11000',
    '6',
    '1001-2000/'
  ])('finds no band in "%s", so it is 404', segment => {
    expect(parseRankBand(segment)).toBeNull()
  })

  test('dialects are listed with the usage labels, and common words on their own', () => {
    expect(categoryIndexOf('dialect')).toBe('usage')
    expect(categoryIndexOf('common')).toBeNull()
  })
})

describe('pageNumber', () => {
  test('reads a later page, and sends page 1 to the list’s own URL', () => {
    expect(pageNumber('2')).toEqual({ page: 2 })
    expect(pageNumber('10000')).toEqual({ page: 10_000 })
    expect(pageNumber('1')).toEqual({ redirect: true })
  })

  test.each([
    '0',
    '02',
    'two',
    '',
    '10001'
  ])('finds no page in "%s", so it is 404 rather than a page the service refuses', segment => {
    expect(pageNumber(segment)).toBeNull()
  })
})
