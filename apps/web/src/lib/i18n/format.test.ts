import { describe, expect, test } from 'vitest'
import { countOf, fill, formatDate, formatNumber, templateParts } from './format'

describe('the format helpers write each language the way Intl does', () => {
  test('fill puts values into a whole sentence and leaves unknown placeholders alone', () => {
    expect(fill('Updated {date}', { date: 'today' })).toBe('Updated today')
    expect(fill('{count} of {total}', { count: 1, total: 3 })).toBe('1 of 3')
    expect(fill('{missing} stays', {})).toBe('{missing} stays')
  })

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

  test('templateParts splits a template at its placeholders', () => {
    expect(templateParts('Email {address} today.')).toEqual([
      { text: 'Email ' },
      { text: '{address}', name: 'address' },
      { text: ' today.' }
    ])
  })
})
