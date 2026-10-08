import { type PathRule, withSlashedSources } from '../sitemap'

const wordSitemapRoute = (number: string) => `/sitemaps/dictionary/${number}.xml`
const laterFile = ':number([2-9]|[1-9]\\d+)'

export const wordSitemapPath = (number: number) =>
  number === 1 ? '/sitemap-words.xml' : `/sitemap-words-${number}.xml`

export const browseSitemapGroups = ['kana', 'categories', 'frequency-lists', 'kanji-lists'] as const

export type BrowseSitemapGroup = (typeof browseSitemapGroups)[number]

export const isBrowseSitemapGroup = (group: string): group is BrowseSitemapGroup =>
  (browseSitemapGroups as readonly string[]).includes(group)

export const browseSitemapPath = (group: BrowseSitemapGroup) => `/sitemap-${group}.xml`

const browseSitemapRoute = (group: string) => `/sitemaps/browse/${group}.xml`
const browseGroup = `:group(${browseSitemapGroups.join('|')})`

export const dictionarySitemapFiles: readonly PathRule[] = [
  { source: wordSitemapPath(1), destination: wordSitemapRoute('1') },
  { source: `/sitemap-words-${laterFile}.xml`, destination: wordSitemapRoute(':number') },
  { source: `/sitemap-${browseGroup}.xml`, destination: browseSitemapRoute(':group') }
]

export const movedDictionarySitemaps = withSlashedSources([
  { source: wordSitemapRoute('1'), destination: wordSitemapPath(1) },
  { source: wordSitemapRoute(laterFile), destination: '/sitemap-words-:number.xml' },
  { source: browseSitemapRoute(browseGroup), destination: '/sitemap-:group.xml' }
])
