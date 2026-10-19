import { kanjiSearchURL, wordURL } from '@zenbu/dictionary-core/detail/links'
import { describe, expect, test } from 'vitest'
import { productionOrigin } from '../origins'
import { hasSearchPath, kanjiSearchPath, searchPath, wordPath, wordSlug } from './urls'

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
})

describe('search URLs', () => {
  test('encode the query as one path segment', () => {
    expect(searchPath('to/from')).toBe('/dictionary/search/to%2Ffrom/')
    expect(searchPath('iru now')).toBe('/dictionary/search/iru%20now/')
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

describe('kanji links', () => {
  test('open the kanji’s search, which leads with its KANJI row', () => {
    expect(kanjiSearchPath('要')).toBe('/dictionary/search/%E8%A6%81/')
    expect(kanjiSearchPath('𠀋')).toBe(searchPath('𠀋'))
  })

  test('a kanji links to the search page of its normalized form', () => {
    expect(kanjiSearchPath('\u{FA45}')).toBe(kanjiSearchPath('海'))
    expect(kanjiSearchPath('\u{F91D}')).toBe(kanjiSearchPath('欄'))
  })
})

describe('the links the app shares', () => {
  test('are the canonical URLs production gives the pages', () => {
    const needed = { headword: '要る', reading: 'いる', entSeq: 1546640 }
    expect(wordURL(needed)).toBe(new URL(encodeURI(wordPath(needed)), productionOrigin).href)
    expect(kanjiSearchURL('\u{FA45}')).toBe(new URL(kanjiSearchPath('海'), productionOrigin).href)
  })
})
