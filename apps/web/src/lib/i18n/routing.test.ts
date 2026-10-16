import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { otherHostResponse } from '@/lib/other-hosts'
import { sitePaths } from '@/lib/pages'
import { routeAsNextMatches } from '@/test/next-routes'
import { locales } from './config'
import { defaultLocaleRedirects, defaultLocaleRewrites, withoutDefaultLocale } from './routing'

describe('bare URLs are rewritten to the English pages, and nothing else is', () => {
  test.each([
    ['/', '/en/'],
    ['/about', '/en/about'],
    ['/legal/privacy', '/en/legal/privacy'],
    ['/dictionary/search/eat', '/en/dictionary/search/eat'],
    ['/dictionary/%E8%A6%81%E3%82%8B-1546640', '/en/dictionary/%E8%A6%81%E3%82%8B-1546640'],
    ['/japan', '/en/japan'],
    ['/english', '/en/english'],
    ['/apiary', '/en/apiary'],
    ['/no-such-page', '/en/no-such-page']
  ])('%s is served by %s', (path, page) => {
    expect(routeAsNextMatches(defaultLocaleRewrites, path)).toBe(page)
  })

  test.each([
    '/ja',
    '/ja/about',
    '/ja/dictionary/search/eat',
    '/en',
    '/en/about',
    '/api',
    '/api/auth/get-session',
    '/_next/static/chunk.js'
  ])('%s is not rewritten', path => {
    expect(routeAsNextMatches(defaultLocaleRewrites, path)).toBeNull()
  })
})

describe('/en/ is never a public URL: it redirects to the bare path in one hop', () => {
  test.each([
    ['/en', '/'],
    ['/en/about', '/about/'],
    ['/en/legal/privacy', '/legal/privacy/'],
    ['/en/dictionary/search/eat', '/dictionary/search/eat/'],
    ['/en/robots.txt', '/robots.txt'],
    ['/en/dictionary/examples/1259290.json', '/dictionary/examples/1259290.json']
  ])('next.config sends %s to %s', (from, to) => {
    expect(routeAsNextMatches(defaultLocaleRedirects, from)).toBe(to)
  })

  test.each(['/english', '/ja/about', '/about', '/enx/about'])('%s is not redirected', path => {
    expect(routeAsNextMatches(defaultLocaleRedirects, path)).toBeNull()
  })

  test.each([
    ['/en', '/'],
    ['/en/', '/'],
    ['/en/about', '/about/'],
    ['/en/about/', '/about/'],
    ['/en/robots.txt', '/robots.txt'],
    ['/en/sitemap-pages.xml/', '/sitemap-pages.xml'],
    ['/en/api/x', '/api/x'],
    ['/english/', undefined],
    ['/ja/about/', undefined]
  ])('the Worker writes %s as %s', (from, to) => {
    expect(withoutDefaultLocale(from)).toBe(to)
  })

  test('www.zenbujapanese.com/en/about reaches the bare page on the canonical host in one hop', () => {
    const response = otherHostResponse(
      new Request('https://www.zenbujapanese.com/en/about'),
      'production'
    )
    expect(response?.headers.get('location')).toBe('https://zenbujapanese.com/about/')
  })
})

const appFolder = fileURLToPath(new URL('../../app/', import.meta.url))
const firstSegments = [
  ...readdirSync(appFolder, { withFileTypes: true }),
  ...readdirSync(new URL('[locale]/', `file://${appFolder}`), { withFileTypes: true })
]
  .filter(entry => entry.isDirectory() && !entry.name.startsWith('['))
  .map(entry => entry.name)

test('no language code is the first segment of an existing page, so adding one changes no URL', () => {
  expect(firstSegments).toEqual(expect.arrayContaining(['dictionary', 'legal', 'products']))
  const pageSegments = sitePaths.map(path => path.split('/')[1]).filter(Boolean)
  for (const code of locales) {
    expect(firstSegments, `the app has a folder named ${code}`).not.toContain(code)
    expect(pageSegments, `a page starts with /${code}/`).not.toContain(code)
  }
})
