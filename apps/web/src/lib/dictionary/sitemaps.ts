import type { DictionaryContract } from '@zenbu/dictionary-core/artifact/contract'
import { localizedSitemapEntries, pageLocales } from '@/lib/seo'
import { absoluteUrl, siteOrigin } from '@/lib/site'
import { type SitemapEntry, urlSetChunks } from '@/lib/sitemap'
import { browseSitemapPaths } from './browse/sitemap'
import { browseSitemapGroups, browseSitemapPath, wordSitemapPath } from './sitemap-files'

const wordsPerQuery = 10_000
const sitemapUrlLimit = 50_000

export const wordsPerSitemap = Math.floor(sitemapUrlLimit / pageLocales().length)

type Answered<T> = { data: T }

type ServiceSitemap = DictionaryContract['wordSitemaps'][number]

export interface SitemapSource {
  wordSitemaps(): Promise<Answered<DictionaryContract['wordSitemaps']>>
  sitemapWords(
    number: number,
    after: number,
    limit: number
  ): Promise<Answered<DictionaryContract['sitemapWords']> | null>
  browseSitemap(): Promise<Answered<DictionaryContract['browseSitemap']> | null>
}

export interface SitemapFile {
  path: string
  urls: number
  xml: () => AsyncIterable<string>
}

const wordPath = (entSeq: number, slug: string) => encodeURI(`/dictionary/${slug}-${entSeq}/`)

export const wordUrl = (entSeq: number, slug: string, origin = siteOrigin()) =>
  absoluteUrl(wordPath(entSeq, slug), origin)

async function* once(entries: readonly SitemapEntry[]) {
  yield entries
}

type WordSlice = { sitemap: ServiceSitemap; skip: number; count: number }

function wordSlices(sitemaps: readonly ServiceSitemap[]): WordSlice[] {
  return sitemaps.flatMap(sitemap =>
    Array.from({ length: Math.ceil(sitemap.urlCount / wordsPerSitemap) }, (_, index) => {
      const skip = index * wordsPerSitemap
      return { sitemap, skip, count: Math.min(wordsPerSitemap, sitemap.urlCount - skip) }
    })
  )
}

function wordsToAsk(read: number, { sitemap, skip, count }: WordSlice): number {
  if (read < skip) return Math.min(wordsPerQuery, skip - read)
  const end = skip + count
  return end === sitemap.urlCount ? wordsPerQuery : Math.min(wordsPerQuery, end - read)
}

async function* sliceWords(source: SitemapSource, slice: WordSlice) {
  const { sitemap, skip, count } = slice
  let after = sitemap.firstEntSeq - 1
  let read = 0
  for (let limit = wordsToAsk(read, slice); limit > 0; limit = wordsToAsk(read, slice)) {
    const rows = (await source.sitemapWords(sitemap.number, after, limit))?.data
    if (!rows) throw new Error(`The dictionary service has no word sitemap ${sitemap.number}`)
    if (rows.length === 0) break
    if (read >= skip) yield rows
    read += rows.length
    after = rows[rows.length - 1].entSeq
  }
  if (read !== skip + count) {
    throw new Error(
      `Word sitemap ${sitemap.number} has ${read} words; the dictionary service listed ${sitemap.urlCount}`
    )
  }
}

function wordSitemapFiles(
  source: SitemapSource,
  sitemaps: DictionaryContract['wordSitemaps'],
  origin: string
): SitemapFile[] {
  return wordSlices(sitemaps).map((slice, index) => ({
    path: wordSitemapPath(index + 1),
    urls: slice.count * pageLocales().length,
    xml: () =>
      urlSetChunks(
        (async function* () {
          for await (const rows of sliceWords(source, slice)) {
            yield rows.flatMap(row =>
              localizedSitemapEntries(wordPath(row.entSeq, row.slug), origin)
            )
          }
        })()
      )
  }))
}

export async function dictionarySitemaps(
  source: SitemapSource,
  origin: string
): Promise<SitemapFile[]> {
  const words = (await source.wordSitemaps()).data
  if (words.length === 0) throw new Error('The dictionary service lists no word sitemaps')
  const browse = (await source.browseSitemap())?.data
  if (!browse) throw new Error('The dictionary service has no browse sitemap')
  const browsePaths = browseSitemapPaths(browse)
  return [
    ...wordSitemapFiles(source, words, origin),
    ...browseSitemapGroups.map(group => {
      const entries = browsePaths[group].flatMap(path => localizedSitemapEntries(path, origin))
      return {
        path: browseSitemapPath(group),
        urls: entries.length,
        xml: () => urlSetChunks(once(entries))
      }
    })
  ]
}
