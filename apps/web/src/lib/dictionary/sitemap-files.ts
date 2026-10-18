import { withSlashedSources } from '../sitemap'

const laterFile = ':number([2-9]|[1-9]\\d+)'

export const wordSitemapPath = (number: number) =>
  number === 1 ? '/sitemap-words.xml' : `/sitemap-words-${number}.xml`

export const browseSitemapGroups = ['kana', 'categories', 'frequency-lists', 'kanji-lists'] as const

export type BrowseSitemapGroup = (typeof browseSitemapGroups)[number]

export const browseSitemapPath = (group: BrowseSitemapGroup) => `/sitemap-${group}.xml`

const browseGroup = `:group(${browseSitemapGroups.join('|')})`

export const movedDictionarySitemaps = withSlashedSources([
  { source: '/sitemaps/dictionary/1.xml', destination: wordSitemapPath(1) },
  { source: `/sitemaps/dictionary/${laterFile}.xml`, destination: '/sitemap-words-:number.xml' },
  { source: `/sitemaps/browse/${browseGroup}.xml`, destination: '/sitemap-:group.xml' }
])

const wordSitemapFile = /^sitemap-words(?:-([2-9]|[1-9]\d+))?\.xml$/

function wordSitemapNumber(name: string): number | null {
  const match = name.match(wordSitemapFile)
  return match ? Number(match[1] ?? 1) : null
}

export function writtenDictionarySitemaps(names: readonly string[]): string[] {
  const words = names
    .map(wordSitemapNumber)
    .filter(number => number !== null)
    .sort((a, b) => a - b)
    .map(wordSitemapPath)
  const browse = browseSitemapGroups.filter(group => names.includes(`sitemap-${group}.xml`))
  return [...words, ...browse.map(browseSitemapPath)]
}

export const isDictionarySitemapFile = (name: string) =>
  wordSitemapNumber(name) !== null ||
  browseSitemapGroups.some(group => name === `sitemap-${group}.xml`)
