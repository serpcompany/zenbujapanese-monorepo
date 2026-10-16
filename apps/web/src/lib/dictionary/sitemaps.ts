import { getCloudflareContext } from '@opennextjs/cloudflare'
import { browseService } from '@zenbu/dictionary-core/browse/service-paths'
import { edgeCache } from '@/lib/edge-cache'
import { localizedSitemapEntries, pageLocales } from '@/lib/seo'
import { absoluteUrl, servedOrigin, siteOrigin } from '@/lib/site'
import { type SitemapEntry, urlSetStream, urlSetXml, xmlResponse } from '@/lib/sitemap'
import { browseSitemapPaths } from './browse/sitemap'
import { dictionaryService } from './data'
import {
  browseSitemapGroups,
  browseSitemapPath,
  isBrowseSitemapGroup,
  wordSitemapPath
} from './sitemap-files'

const wordsPerQuery = 10_000
const sitemapUrlLimit = 50_000

export const wordsPerSitemap = Math.floor(sitemapUrlLimit / pageLocales().length)

type ServiceSitemap = { number: number; firstEntSeq: number; urlCount: number }

type WordSitemapFile = { number: number; sitemap: ServiceSitemap; skip: number; count: number }

function wordSitemapFiles(sitemaps: readonly ServiceSitemap[]): WordSitemapFile[] {
  const files: WordSitemapFile[] = []
  for (const sitemap of sitemaps) {
    for (let skip = 0; skip < sitemap.urlCount; skip += wordsPerSitemap) {
      const count = Math.min(wordsPerSitemap, sitemap.urlCount - skip)
      files.push({ number: files.length + 1, sitemap, skip, count })
    }
  }
  return files
}

export async function dictionarySitemapPaths(): Promise<string[]> {
  const api = await dictionaryService()
  if (!api) return []
  const files = wordSitemapFiles((await api.wordSitemaps()).data)
  return [
    ...files.map(file => wordSitemapPath(file.number)),
    ...browseSitemapGroups.map(browseSitemapPath)
  ]
}

export async function browseSitemapResponse(request: Request, group: string) {
  if (!isBrowseSitemapGroup(group)) return null
  const api = await dictionaryService()
  const found = api ? await api.browse(browseService.sitemap()) : null
  if (!found) return null
  const origin = servedOrigin(request)
  return cachedForBuild(request, found.build, () =>
    xmlResponse(
      urlSetXml(
        browseSitemapPaths(found.data)[group].flatMap(path => localizedSitemapEntries(path, origin))
      )
    )
  )
}

const wordPath = (entSeq: number, slug: string) => encodeURI(`/dictionary/${slug}-${entSeq}/`)

export const wordUrl = (entSeq: number, slug: string, origin = siteOrigin()) =>
  absoluteUrl(wordPath(entSeq, slug), origin)

export async function wordSitemapResponse(request: Request, number: number) {
  const api = await dictionaryService()
  if (!api) return null
  const sitemaps = await api.wordSitemaps()
  const file = wordSitemapFiles(sitemaps.data).find(candidate => candidate.number === number)
  if (!file) return null
  const origin = servedOrigin(request)
  const { sitemap, skip, count } = file
  const words = async (after: number, limit: number) =>
    (await api.sitemapWords(sitemap.number, after, Math.min(wordsPerQuery, limit)))?.data ?? []
  async function* pages(): AsyncGenerator<SitemapEntry[]> {
    let after = sitemap.firstEntSeq - 1
    for (let skipped = 0; skipped < skip; ) {
      const rows = await words(after, skip - skipped)
      if (rows.length === 0) return
      skipped += rows.length
      after = rows[rows.length - 1].entSeq
    }
    for (let listed = 0; listed < count; ) {
      const rows = await words(after, count - listed)
      if (rows.length === 0) return
      yield rows.flatMap(row => localizedSitemapEntries(wordPath(row.entSeq, row.slug), origin))
      listed += rows.length
      after = rows[rows.length - 1].entSeq
    }
  }
  return cachedForBuild(request, sitemaps.build, () => xmlResponse(urlSetStream(pages())))
}

async function cachedForBuild(
  request: Request,
  build: string,
  render: () => Response | Promise<Response>
): Promise<Response> {
  const cache = edgeCache()
  if (!cache) return render()
  const url = new URL(request.url)
  url.search = `?build=${encodeURIComponent(build)}`
  const key = new Request(url.toString(), { method: 'GET' })
  const hit = await cache.match(key)
  if (hit) return hit
  const response = await render()
  const { ctx } = await getCloudflareContext({ async: true })
  ctx.waitUntil(cache.put(key, response.clone()))
  return response
}
