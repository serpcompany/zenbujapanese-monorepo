import { describe, expect, test } from 'vitest'
import {
  conjugatedFormPath,
  conjugationsHref,
  conjugationsPath,
  hasSearchPath,
  normalizeSearchQuery,
  parseWordSegment,
  searchPath,
  wordPath,
  wordSlug
} from './urls'

describe('word URLs (ADR 0007)', () => {
  test('end in the JMdict entry number after a readable slug', () => {
    expect(wordPath({ headword: '要る', reading: 'いる', entSeq: 1546640 })).toBe(
      '/dictionary/要る-1546640/'
    )
  })

  test('replace characters that break paths and fall back to the reading', () => {
    expect(wordSlug('A/B ?C', 'えー')).toBe('A-B-C')
    expect(wordSlug('/', 'すらっしゅ')).toBe('すらっしゅ')
  })

  test('parse with any slug, or none, because the number decides', () => {
    expect(parseWordSegment('要る-1546640')).toEqual({ slug: '要る', entSeq: 1546640 })
    expect(parseWordSegment('%E8%A6%81%E3%82%8B-1546640')).toEqual({
      slug: '要る',
      entSeq: 1546640
    })
    expect(parseWordSegment('1546640')).toEqual({ slug: '', entSeq: 1546640 })
    expect(parseWordSegment('a-b-1546640')).toEqual({ slug: 'a-b', entSeq: 1546640 })
    expect(parseWordSegment('search')).toBeNull()
  })
})

describe('search URLs', () => {
  test('normalize the query and encode it as one path segment', () => {
    expect(normalizeSearchQuery('  Ｉｒｕ  Now ')).toBe('iru now')
    expect(searchPath('to/from')).toBe('/dictionary/search/to%2Ffrom/')
  })

  test('encode dots, so a query never looks like a file', () => {
    expect(searchPath('3.14')).toBe('/dictionary/search/3%2E14/')
    expect(searchPath('e.g.')).toBe('/dictionary/search/e%2Eg%2E/')
  })

  test('have no path for `.` or `..`, which URLs treat as directories', () => {
    expect(hasSearchPath('.')).toBe(false)
    expect(hasSearchPath('..')).toBe(false)
    expect(hasSearchPath('...')).toBe(true)
    expect(hasSearchPath('3.14')).toBe(true)
  })
})

describe('conjugation URLs', () => {
  test('put the table under the word, and each form under the table by register and kind', () => {
    const word = '/dictionary/見る-1259290/'
    expect(conjugationsPath(word)).toBe('/dictionary/見る-1259290/conjugations/')
    expect(conjugatedFormPath(word, 'Plain', 'past')).toBe(
      '/dictionary/見る-1259290/conjugations/plain/past/'
    )
    expect(conjugatedFormPath(word, 'Polite', 'past-negative')).toBe(
      '/dictionary/見る-1259290/conjugations/polite/past-negative/'
    )
  })

  test('link back to the table in the register a form is in', () => {
    const table = '/dictionary/見る-1259290/conjugations/'
    expect(conjugationsHref(table, 'Plain')).toBe(table)
    expect(conjugationsHref(table, 'Polite')).toBe(`${table}#polite`)
  })
})
