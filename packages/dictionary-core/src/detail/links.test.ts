import { describe, expect, test } from 'vitest'
import { parseWordSegment, websitePage } from './links'

const page = (path: string, host: string | null = 'zenbujapanese.com') => websitePage(host, path)

describe('parseWordSegment', () => {
  test('reads the entry number after any slug, or none', () => {
    expect(parseWordSegment('要る-1546640')).toEqual({ slug: '要る', entSeq: 1546640 })
    expect(parseWordSegment('%E8%A6%81%E3%82%8B-1546640')).toEqual({
      slug: '要る',
      entSeq: 1546640
    })
    expect(parseWordSegment('1546640')).toEqual({ slug: '', entSeq: 1546640 })
    expect(parseWordSegment('a-b-1546640')).toEqual({ slug: 'a-b', entSeq: 1546640 })
  })

  test.each([
    'search',
    '見る-',
    '見る-12a',
    '見る-１２３',
    '見る-99999999999999999999999'
  ])('%s names no entry', segment => {
    expect(parseWordSegment(segment)).toBeNull()
  })
})

describe('websitePage', () => {
  test.each([
    '/dictionary/見る-1259290/',
    '/dictionary/%E8%A6%8B%E3%82%8B-1259290/',
    '/dictionary/見る-1259290',
    '/dictionary/見る-1259290/conjugations/plain/past/'
  ])('%s is the word with that entry number', path => {
    expect(page(path)).toEqual({ kind: 'word', entSeq: 1259290, slug: '見る' })
  })

  test('the host is compared without regard to case', () => {
    expect(page('/dictionary/1259290/', 'ZenbuJapanese.com')).toEqual({
      kind: 'word',
      entSeq: 1259290,
      slug: ''
    })
  })

  test.each([
    ['/dictionary/search/iru/', 'iru'],
    ['/dictionary/search/見る/', '見る'],
    ['/dictionary/search/to%20eat/', 'to eat'],
    ['/dictionary/search/a%2Fb/', 'a/b'],
    ['/dictionary/search/%2E%2E%2E/', '...'],
    ['/dictionary/search/100%25/', '100%'],
    ['/dictionary/search/iru/examples/', 'iru'],
    ['/dictionary/search/%20iru%E3%80%80/', 'iru']
  ])('%s searches its query, decoded once: %s', (path, query) => {
    expect(page(path)).toEqual({ kind: 'search', query })
  })

  test('a kanji path is that exact character, never a normalized one', () => {
    expect(page('/dictionary/kanji/%E8%A6%8B/')).toEqual({ kind: 'kanji', character: '見' })
    const compatibilityIdeograph = String.fromCodePoint(0xf928)
    expect(page('/dictionary/kanji/%EF%A4%A8/')).toEqual({
      kind: 'kanji',
      character: compatibilityIdeograph
    })
  })

  test.each([
    ['/dictionary/見る-1259290/', 'example.com'],
    ['/dictionary/見る-1259290/', 'zenbujapanese.com.example.com'],
    ['/dictionary/見る-1259290/', null],
    ['/', 'zenbujapanese.com'],
    ['/about/', 'zenbujapanese.com'],
    ['/dictionary/', 'zenbujapanese.com'],
    ['/dictionary/search/', 'zenbujapanese.com'],
    ['/dictionary/search/%20/', 'zenbujapanese.com'],
    ['/dictionary/kanji/', 'zenbujapanese.com'],
    ['/dictionary/kanji/ab/', 'zenbujapanese.com'],
    ['/dictionary/kanji/a/', 'zenbujapanese.com'],
    ['/dictionary/見る/', 'zenbujapanese.com'],
    ['/dictionary/見る-99999999999999999999999/', 'zenbujapanese.com'],
    ['/legal/privacy/', 'zenbujapanese.com']
  ])('%s on %s is the home page', (path, host) => {
    expect(page(path, host)).toEqual({ kind: 'home' })
  })
})
