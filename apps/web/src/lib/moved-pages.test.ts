import { modifyRouteRegex } from 'next/dist/lib/redirect-status'
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match'
import { prepareDestination } from 'next/dist/shared/lib/router/utils/prepare-destination'
import { describe, expect, test } from 'vitest'
import { movedPageResponse, otherCategoryOrder, removedDictionaryPages } from './moved-pages'

describe('movedPageResponse', () => {
  test.each([
    ['https://zenbujapanese.com/privacy', 'https://zenbujapanese.com/legal/privacy/'],
    ['https://zenbujapanese.com/privacy/', 'https://zenbujapanese.com/legal/privacy/'],
    [
      'https://staging.zenbujapanese.com/privacy?from=app',
      'https://staging.zenbujapanese.com/legal/privacy/?from=app'
    ]
  ])('sends %s to %s in one 308', (from, to) => {
    const response = movedPageResponse(new URL(from))
    expect(response?.status).toBe(308)
    expect(response?.headers.get('location')).toBe(to)
  })

  test.each([
    'https://zenbujapanese.com/',
    'https://zenbujapanese.com/legal/privacy/',
    'https://zenbujapanese.com/privacy-policy/',
    'https://zenbujapanese.com/support'
  ])('leaves %s to the site', url => {
    expect(movedPageResponse(new URL(url))).toBeNull()
  })
})

function redirectAsNextMatches(pathname: string): string | null {
  for (const { source, destination } of [...removedDictionaryPages, ...otherCategoryOrder]) {
    const params = getPathMatch(source, {
      strict: true,
      removeUnnamedParams: true,
      regexModifier: regex => modifyRouteRegex(regex, ['/_next'])
    })(pathname)
    if (params) {
      return prepareDestination({ appendParamsToQuery: false, destination, params, query: {} })
        .parsedDestination.pathname
    }
  }
  return null
}

const miru = '/dictionary/%E8%A6%8B%E3%82%8B-1259290/'

describe('removedDictionaryPages, the pages the three page types replaced', () => {
  test.each([
    ['/dictionary/kanji/%E8%A6%8B/', '/dictionary/search/%E8%A6%8B/'],
    ['/dictionary/kanji/%F0%A0%80%8B', '/dictionary/search/%F0%A0%80%8B/'],
    [`${miru}conjugations/`, miru],
    [`${miru}conjugations/plain/past/`, miru],
    [`${miru}conjugations/polite/te-form`, miru],
    ['/dictionary/search/eat/examples/', '/dictionary/search/eat/'],
    [
      '/dictionary/search/%E9%A3%9F%E3%81%B9%E3%81%9F/examples',
      '/dictionary/search/%E9%A3%9F%E3%81%B9%E3%81%9F/'
    ],
    ['/dictionary/search/a%2Fb/examples/', '/dictionary/search/a%2Fb/']
  ])('send %s to %s', (from, to) => {
    expect(redirectAsNextMatches(from)).toBe(to)
  })

  test.each([
    miru,
    '/dictionary/kanji/',
    '/dictionary/search/kanji/',
    '/dictionary/search/examples/',
    '/dictionary/search/eat/examples.json',
    '/dictionary/conjugations/%E8%A6%8B%E3%81%9F.json',
    '/dictionary/examples/1259290.json',
    '/dictionary/search/conjugations/',
    '/dictionary/search/conjugations/examples.json'
  ])('leave %s to the site', pathname => {
    expect(redirectAsNextMatches(pathname)).toBeNull()
  })
})

describe('otherCategoryOrder, a category in kana order', () => {
  test.each([
    ['/dictionary/browse/onomatopoeia/kana-order/', '/dictionary/browse/onomatopoeia/'],
    ['/dictionary/browse/onomatopoeia/kana-order', '/dictionary/browse/onomatopoeia/'],
    ['/dictionary/browse/ichidan-verbs/kana-order/3/', '/dictionary/browse/ichidan-verbs/3/']
  ])('sends %s to %s, the category most used first', (from, to) => {
    expect(redirectAsNextMatches(from)).toBe(to)
  })

  test.each([
    '/dictionary/browse/onomatopoeia/',
    '/dictionary/browse/onomatopoeia/2/',
    '/dictionary/browse/kanji/grade-1/'
  ])('leaves %s to the site', pathname => {
    expect(redirectAsNextMatches(pathname)).toBeNull()
  })
})
