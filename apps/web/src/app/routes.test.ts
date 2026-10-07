import { readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const appFolder = fileURLToPath(new URL('.', import.meta.url))

const routeFiles: Record<string, (route: string) => string> = {
  'page.tsx': route => `page ${route}`,
  'route.ts': route => `data ${route}`,
  'robots.ts': () => 'data /robots.txt'
}

function servedRoutes(folder = appFolder): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) return servedRoutes(path)
    const describe = routeFiles[entry.name]
    if (!describe) return []
    const segments = relative(appFolder, folder).split(sep).filter(Boolean)
    return [describe(`/${segments.join('/')}`)]
  })
}

const decidedRoutes = [
  'page /',
  'page /about',
  'page /contact',
  'page /support',
  'page /sources',
  'page /sitemap',
  'page /legal',
  'page /legal/privacy',
  'page /legal/terms',
  'page /legal/dmca',
  'page /legal/affiliate-disclosure',
  'page /dictionary',
  'page /dictionary/search',
  'page /dictionary/search/[query]',
  'page /dictionary/[word]',
  'page /dictionary/browse',
  'page /dictionary/browse/kana',
  'page /dictionary/browse/hiragana',
  'page /dictionary/browse/hiragana/[prefix]',
  'page /dictionary/browse/hiragana/[prefix]/[page]',
  'page /dictionary/browse/katakana',
  'page /dictionary/browse/katakana/[prefix]',
  'page /dictionary/browse/katakana/[prefix]/[page]',
  'page /dictionary/browse/kanji',
  'page /dictionary/browse/kanji/[list]',
  'page /dictionary/browse/frequency-dictionaries',
  'page /dictionary/browse/frequency-dictionaries/[list]/[band]',
  'page /dictionary/browse/frequency-dictionaries/jlpt/[level]',
  'page /dictionary/browse/frequency-dictionaries/jlpt/[level]/[page]',
  'page /dictionary/browse/parts-of-speech',
  'page /dictionary/browse/usage',
  'page /dictionary/browse/subjects',
  'page /dictionary/browse/[category]',
  'page /dictionary/browse/[category]/[page]',
  'page /dictionary/browse/[category]/kana-order',
  'page /dictionary/browse/[category]/kana-order/[page]',
  'data /dictionary/examples/[file]',
  'data /dictionary/search/[query]/examples.json',
  'data /dictionary/conjugations/[file]',
  'data /dictionary/service.json',
  'data /robots.txt',
  'data /sitemap-index.xml',
  'data /sitemap.xml',
  'data /sitemaps/pages.xml',
  'data /sitemaps/dictionary/[file]',
  'data /sitemaps/browse.xml'
]

test('the site serves only the pages and data routes that have been decided', () => {
  expect(
    servedRoutes().sort(),
    'Every page and data route is decided (docs/adr/0010-give-the-dictionary-three-page-types.md, #544, #614): the dictionary has its home, search, and word pages, and the browse pages that link to them, and what the app drills into lives on the word page. A new page or route needs an owner decision recorded first; then add it here.'
  ).toEqual([...decidedRoutes].sort())
})
