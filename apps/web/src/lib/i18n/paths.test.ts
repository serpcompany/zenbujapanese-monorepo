import { describe, expect, test } from 'vitest'
import { localizedPath, pathLocale } from './paths'

describe('localizedPath adds the language prefix to page links only', () => {
  test.each([
    ['/', '/ja/'],
    ['/about/', '/ja/about/'],
    ['/dictionary/search/%E8%A6%8B%E3%82%8B/', '/ja/dictionary/search/%E8%A6%8B%E3%82%8B/'],
    [
      '/dictionary/%E8%A6%81%E3%82%8B-1546640/#examples',
      '/ja/dictionary/%E8%A6%81%E3%82%8B-1546640/#examples'
    ],
    ['/products/?type=app', '/ja/products/?type=app'],
    ['/dictionary/search/a%2Eb/', '/ja/dictionary/search/a%2Eb/']
  ])('%s in Japanese is %s', (path, japanese) => {
    expect(localizedPath(path, 'ja')).toBe(japanese)
    expect(localizedPath(path, 'en')).toBe(path)
  })

  test.each([
    '#',
    '#examples',
    '/robots.txt',
    '/sitemap-index.xml',
    '/dictionary/examples/1259290.json?from=5',
    '/screenshots/app-store/01-search-results.webp',
    '/api/auth/get-session',
    '/_next/static/chunk.js',
    '/.well-known/apple-app-site-association',
    '//cdn.example.com/x/',
    'https://apps.apple.com/app/id1',
    'mailto:support@zenbujapanese.com'
  ])('%s stays as it is', path => {
    expect(localizedPath(path, 'ja')).toBe(path)
  })
})

describe('pathLocale reads the language from a public path', () => {
  test.each([
    ['/', 'en', '/'],
    ['/about/', 'en', '/about/'],
    ['/ja/', 'ja', '/'],
    ['/ja', 'ja', '/'],
    ['/ja/about/', 'ja', '/about/'],
    ['/japan/', 'en', '/japan/']
  ])('%s is %s, at %s', (pathname, locale, path) => {
    expect(pathLocale(pathname)).toEqual({ locale, path })
  })
})
