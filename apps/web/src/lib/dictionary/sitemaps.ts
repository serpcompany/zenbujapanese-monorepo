import { getCloudflareContext } from '@opennextjs/cloudflare'
import { browseService } from '@zenbu/dictionary-core/browse/service-paths'
import { edgeCache } from '@/lib/edge-cache'
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

export async function dictionarySitemapPaths(): Promise<string[]> {
  const api = await dictionaryService()
  if (!api) return []
  const sitemaps = (await api.wordSitemaps()).data
  return [
    ...sitemaps.map(sitemap => wordSitemapPath(sitemap.number)),
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
        browseSitemapPaths(found.data)[group].map(path => ({ url: absoluteUrl(path, origin) }))
      )
    )
  )
}

export const wordUrl = (entSeq: number, slug: string, origin = siteOrigin()) =>
  absoluteUrl(encodeURI(`/dictionary/${slug}-${entSeq}/`), origin)

export async function wordSitemapResponse(request: Request, number: number) {
  const api = await dictionaryService()
  if (!api) return null
  const sitemaps = await api.wordSitemaps()
  const range = sitemaps.data.find(sitemap => sitemap.number === number)
  if (!range) return null
  const origin = servedOrigin(request)
  async function* pages(): AsyncGenerator<SitemapEntry[]> {
    let after = range ? range.firstEntSeq - 1 : 0
    for (;;) {
      const rows = (await api?.sitemapWords(number, after, wordsPerQuery))?.data ?? []
      if (rows.length === 0) return
      yield rows.map(row => ({ url: wordUrl(row.entSeq, row.slug, origin) }))
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
