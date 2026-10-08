import { type PathRule, withSlashedSources } from '../sitemap'

const wordSitemapRoute = (number: string) => `/sitemaps/dictionary/${number}.xml`
const laterFile = ':number([2-9]|[1-9]\\d+)'

export const wordSitemapPath = (number: number) =>
  number === 1 ? '/sitemap-words.xml' : `/sitemap-words-${number}.xml`

export const browseSitemapPath = '/sitemap-browse.xml'

export const dictionarySitemapFiles: readonly PathRule[] = [
  { source: wordSitemapPath(1), destination: wordSitemapRoute('1') },
  { source: `/sitemap-words-${laterFile}.xml`, destination: wordSitemapRoute(':number') }
]

export const movedDictionarySitemaps = withSlashedSources([
  { source: '/sitemaps/browse.xml', destination: browseSitemapPath },
  { source: wordSitemapRoute('1'), destination: wordSitemapPath(1) },
  { source: wordSitemapRoute(laterFile), destination: '/sitemap-words-:number.xml' }
])
