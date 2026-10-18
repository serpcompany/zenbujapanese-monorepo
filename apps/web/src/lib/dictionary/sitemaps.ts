import type { DictionaryContract } from '@zenbu/dictionary-core/artifact/contract'
import { absoluteUrl, siteOrigin } from '@/lib/site'
import { type SitemapEntry, urlSetChunks } from '@/lib/sitemap'
import { browseSitemapPaths } from './browse/sitemap'
import { browseSitemapGroups, browseSitemapPath, wordSitemapPath } from './sitemap-files'

const wordsPerQuery = 10_000

type Answered<T> = { data: T }

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

export const wordUrl = (entSeq: number, slug: string, origin = siteOrigin()) =>
  absoluteUrl(encodeURI(`/dictionary/${slug}-${entSeq}/`), origin)

async function* once(entries: readonly SitemapEntry[]) {
  yield entries
}

function wordSitemapFiles(
  source: SitemapSource,
  sitemaps: DictionaryContract['wordSitemaps'],
  origin: string
): SitemapFile[] {
  return sitemaps.map(sitemap => ({
    path: wordSitemapPath(sitemap.number),
    urls: sitemap.urlCount,
    xml: () =>
      urlSetChunks(
        (async function* () {
          let after = sitemap.firstEntSeq - 1
          let written = 0
          for (;;) {
            const rows = (await source.sitemapWords(sitemap.number, after, wordsPerQuery))?.data
            if (!rows)
              throw new Error(`The dictionary service has no word sitemap ${sitemap.number}`)
            if (rows.length === 0) break
            written += rows.length
            yield rows.map(row => ({ url: wordUrl(row.entSeq, row.slug, origin) }))
            after = rows[rows.length - 1].entSeq
          }
          if (written !== sitemap.urlCount) {
            throw new Error(
              `Word sitemap ${sitemap.number} has ${written} words; the dictionary service listed ${sitemap.urlCount}`
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
      const entries = browsePaths[group].map(path => ({ url: absoluteUrl(path, origin) }))
      return {
        path: browseSitemapPath(group),
        urls: entries.length,
        xml: () => urlSetChunks(once(entries))
      }
    })
  ]
}
