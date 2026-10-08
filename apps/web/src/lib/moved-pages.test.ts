import { describe, expect, test } from 'vitest'
import { routeAsNextMatches } from '@/test/next-routes'
import { movedPageResponse, removedDictionaryPages } from './moved-pages'

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
    expect(routeAsNextMatches(removedDictionaryPages, from)).toBe(to)
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
    expect(routeAsNextMatches(removedDictionaryPages, pathname)).toBeNull()
  })
})
