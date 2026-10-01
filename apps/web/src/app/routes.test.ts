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
  'data /dictionary/examples/[file]',
  'data /dictionary/search/[query]/examples.json',
  'data /dictionary/conjugations/[file]',
  'data /dictionary/service.json',
  'data /robots.txt',
  'data /sitemap-index.xml',
  'data /sitemap.xml',
  'data /sitemaps/pages.xml',
  'data /sitemaps/dictionary/[file]'
]

test('the site serves only the pages and data routes that have been decided', () => {
  expect(
    servedRoutes().sort(),
    'Every page and data route is decided (docs/adr/0010-give-the-dictionary-three-page-types.md, #544): the dictionary has only its home, search, and word pages, and what the app drills into lives on the word page. A new page or route needs an owner decision recorded first; then add it here.'
  ).toEqual([...decidedRoutes].sort())
})
