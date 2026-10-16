import { readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const appFolder = fileURLToPath(new URL('.', import.meta.url))

const routeFiles: Record<string, (route: string) => string> = {
  'page.tsx': route => `page ${route}`,
  'route.ts': route => `data ${route}`
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
  'page /[locale]',
  'page /[locale]/about',
  'page /[locale]/contact',
  'page /[locale]/support',
  'page /[locale]/sources',
  'page /[locale]/sitemap',
  'page /[locale]/products',
  'page /[locale]/products/zenbu-japanese-app',
  'page /[locale]/legal',
  'page /[locale]/legal/privacy',
  'page /[locale]/legal/terms',
  'page /[locale]/legal/dmca',
  'page /[locale]/legal/affiliate-disclosure',
  'page /[locale]/login',
  'page /[locale]/register',
  'page /[locale]/forgot-password',
  'page /[locale]/account',
  'page /[locale]/dictionary',
  'page /[locale]/dictionary/search',
  'page /[locale]/dictionary/search/[query]',
  'page /[locale]/dictionary/[word]',
  'page /[locale]/dictionary/browse',
  'page /[locale]/dictionary/browse/kana',
  'page /[locale]/dictionary/browse/hiragana',
  'page /[locale]/dictionary/browse/hiragana/[prefix]',
  'page /[locale]/dictionary/browse/hiragana/[prefix]/[page]',
  'page /[locale]/dictionary/browse/katakana',
  'page /[locale]/dictionary/browse/katakana/[prefix]',
  'page /[locale]/dictionary/browse/katakana/[prefix]/[page]',
  'page /[locale]/dictionary/browse/kanji',
  'page /[locale]/dictionary/browse/kanji/[list]',
  'page /[locale]/dictionary/browse/frequency-dictionaries',
  'page /[locale]/dictionary/browse/frequency-dictionaries/[list]/[band]',
  'page /[locale]/dictionary/browse/frequency-dictionaries/jlpt/[level]',
  'page /[locale]/dictionary/browse/frequency-dictionaries/jlpt/[level]/[page]',
  'page /[locale]/dictionary/browse/parts-of-speech',
  'page /[locale]/dictionary/browse/usage',
  'page /[locale]/dictionary/browse/subjects',
  'page /[locale]/dictionary/browse/[category]',
  'page /[locale]/dictionary/browse/[category]/[page]',
  'page /[locale]/dictionary/browse/[category]/kana-order',
  'page /[locale]/dictionary/browse/[category]/kana-order/[page]',
  'data /[locale]/dictionary/examples/[file]',
  'data /[locale]/dictionary/search/[query]/examples.json',
  'data /[locale]/dictionary/conjugations/[file]',
  'data /dictionary/service.json',
  'data /robots.txt',
  'data /sitemap-index.xml',
  'data /sitemap-pages.xml',
  'data /sitemaps/dictionary/[file]',
  'data /sitemaps/browse/[file]'
]

test('the site serves only the pages and data routes that have been decided', () => {
  expect(
    servedRoutes().sort(),
    'Every page and data route is decided (docs/adr/0010-give-the-dictionary-three-page-types.md, #544, #614, #648 for the products pages, #663 for the sitemap files, #468 for the account pages, and #666 for the language segment that serves each in English and Japanese): the dictionary has its home, search, and word pages, and the browse pages that link to them, and what the app drills into lives on the word page. A new page or route needs an owner decision recorded first; then add it here.'
  ).toEqual([...decidedRoutes].sort())
})
