import { describe, expect, test } from 'vitest'
import { countOf, formatDate, formatNumber } from './format'

describe('the format helpers write each language the way Intl does', () => {
  test('countOf picks the plural form for the language', () => {
    const words = { one: '{count} word', other: '{count} words' }
    expect(countOf(words, 1, 'en')).toBe('1 word')
    expect(countOf(words, 1234, 'en')).toBe('1,234 words')
    expect(countOf({ one: '{count}語', other: '{count}語' }, 1, 'ja')).toBe('1語')
  })

  test('numbers and dates are formatted for the language', () => {
    expect(formatNumber(218382, 'en')).toBe('218,382')
    expect(formatNumber(218382, 'ja')).toBe('218,382')
    expect(formatDate('2026-10-09', 'en')).toBe('October 9, 2026')
    expect(formatDate('2026-10-09', 'ja')).toBe('2026年10月9日')
  })
})
