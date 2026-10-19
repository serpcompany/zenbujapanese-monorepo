import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  homeHeadLinks,
  hreflangPaths,
  localizedAlternates,
  localizedSitemapEntries,
  siteOpenGraph
} from './seo'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('every page names each language it is published in, itself included, and x-default', () => {
  test('a page lists its English and Japanese URLs, with English as x-default', () => {
    expect(hreflangPaths('/about/')).toEqual({
      en: '/about/',
      ja: '/ja/about/',
      'x-default': '/about/'
    })
  })

  test.each([
    ['en', '/legal/privacy/'],
    ['ja', '/ja/legal/privacy/']
  ] as const)('the %s page is canonical in its own language, at %s', (locale, canonical) => {
    expect(localizedAlternates('/legal/privacy/', locale)).toEqual({
      canonical,
      languages: hreflangPaths('/legal/privacy/')
    })
  })

  test('Open Graph names the language of the page', () => {
    expect(siteOpenGraph('en')).toMatchObject({
      siteName: 'Zenbu Japanese',
      type: 'website',
      locale: 'en_US'
    })
    expect(siteOpenGraph('ja').locale).toBe('ja_JP')
  })

  test.each([
    ['production', 'https://zenbujapanese.com'],
    ['staging', 'https://staging.zenbujapanese.com']
  ])('with SITE_ENV=%s, the homepages write the English one as the bare origin', (env, origin) => {
    vi.stubEnv('SITE_ENV', env)
    const alternates = [
      { rel: 'alternate', hrefLang: 'en', href: origin },
      { rel: 'alternate', hrefLang: 'ja', href: `${origin}/ja/` },
      { rel: 'alternate', hrefLang: 'x-default', href: origin }
    ]
    expect(homeHeadLinks('en')).toEqual([{ rel: 'canonical', href: origin }, ...alternates])
    expect(homeHeadLinks('ja')).toEqual([
      { rel: 'canonical', href: `${origin}/ja/` },
      ...alternates
    ])
  })

  test('each language of a page sits in the sitemap with the same alternates as its hreflang', () => {
    const origin = 'https://zenbujapanese.com'
    const alternates = [
      { hreflang: 'en', url: `${origin}/sources/` },
      { hreflang: 'ja', url: `${origin}/ja/sources/` },
      { hreflang: 'x-default', url: `${origin}/sources/` }
    ]
    expect(localizedSitemapEntries('/sources/', origin)).toEqual([
      { url: `${origin}/sources/`, alternates },
      { url: `${origin}/ja/sources/`, alternates }
    ])
    expect(localizedSitemapEntries('/', origin).map(entry => entry.url)).toEqual([
      origin,
      `${origin}/ja/`
    ])
  })
})
