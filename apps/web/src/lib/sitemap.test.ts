import { describe, expect, it, test } from 'vitest'
import { routeAsNextMatches } from '@/test/next-routes'
import {
  browseSitemapPath,
  dictionarySitemapFiles,
  movedDictionarySitemaps,
  wordSitemapPath
} from './dictionary/sitemap-files'
import { childSitemaps, movedSitemaps, sitemapIndexXml, urlSetXml } from './sitemap'

const moved = [...movedSitemaps, ...movedDictionarySitemaps]

describe('sitemaps', () => {
  it('lists child sitemaps as absolute URLs on the origin it is given', () => {
    expect(sitemapIndexXml(childSitemaps, 'https://staging.zenbujapanese.com')).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://staging.zenbujapanese.com/sitemap-pages.xml</loc></sitemap></sitemapindex>'
    )
  })

  it('escapes URLs and writes lastmod', () => {
    const xml = urlSetXml([
      { url: 'https://zenbujapanese.com/?a=1&b=2', lastModified: new Date('2026-09-28T00:00:00Z') }
    ])
    expect(xml).toContain('<loc>https://zenbujapanese.com/?a=1&amp;b=2</loc>')
    expect(xml).toContain('<lastmod>2026-09-28T00:00:00.000Z</lastmod>')
  })
})

describe('sitemap files sit at the root, named for their group', () => {
  test.each([
    [1, '/sitemap-words.xml'],
    [2, '/sitemap-words-2.xml'],
    [12, '/sitemap-words-12.xml']
  ])('word sitemap %i is %s', (number, path) => {
    expect(wordSitemapPath(number)).toBe(path)
    expect(routeAsNextMatches(dictionarySitemapFiles, path)).toBe(
      `/sitemaps/dictionary/${number}.xml`
    )
  })

  test.each([
    ['kana', '/sitemap-kana.xml'],
    ['categories', '/sitemap-categories.xml'],
    ['frequency-lists', '/sitemap-frequency-lists.xml'],
    ['kanji-lists', '/sitemap-kanji-lists.xml']
  ] as const)('the %s browse sitemap is %s', (group, path) => {
    expect(browseSitemapPath(group)).toBe(path)
    expect(routeAsNextMatches(dictionarySitemapFiles, path)).toBe(`/sitemaps/browse/${group}.xml`)
  })

  test.each([
    '/sitemap-browse.xml',
    '/sitemap-words-1.xml',
    '/sitemap-words-0.xml',
    '/sitemap-words-02.xml',
    '/sitemap-words-x.xml',
    '/sitemap-pages.xml'
  ])('%s is no dictionary sitemap', path => {
    expect(routeAsNextMatches(dictionarySitemapFiles, path)).toBeNull()
  })

  test.each([
    ['/sitemap.xml', '/sitemap-index.xml'],
    ['/sitemap.xml/', '/sitemap-index.xml'],
    ['/sitemaps/pages.xml', '/sitemap-pages.xml'],
    ['/sitemaps/dictionary/1.xml', '/sitemap-words.xml'],
    ['/sitemaps/dictionary/2.xml', '/sitemap-words-2.xml'],
    ['/sitemaps/dictionary/15.xml', '/sitemap-words-15.xml'],
    ['/sitemaps/pages.xml/', '/sitemap-pages.xml'],
    ['/sitemaps/dictionary/1.xml/', '/sitemap-words.xml'],
    ['/sitemaps/dictionary/2.xml/', '/sitemap-words-2.xml'],
    ['/sitemaps/browse/kana.xml', '/sitemap-kana.xml'],
    ['/sitemaps/browse/kanji-lists.xml/', '/sitemap-kanji-lists.xml']
  ])('the old %s redirects to %s', (from, to) => {
    expect(routeAsNextMatches(moved, from)).toBe(to)
  })

  test.each([
    '/sitemaps/kanji.xml',
    '/sitemaps/conjugations.xml',
    '/sitemaps/dictionary/0.xml',
    '/sitemaps/browse.xml',
    '/sitemaps/browse/browse.xml'
  ])('%s stays gone', path => {
    expect(routeAsNextMatches(moved, path)).toBeNull()
  })
})
