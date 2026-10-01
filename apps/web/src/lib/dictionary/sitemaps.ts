import { getCloudflareContext } from '@opennextjs/cloudflare'
import { absoluteUrl } from '@/lib/site'
import { type SitemapEntry, urlSetStream, xmlResponse } from '@/lib/sitemap'
import { dictionaryService } from './data'

const wordsPerQuery = 10_000

export async function dictionarySitemapPaths(): Promise<string[]> {
  const api = await dictionaryService()
  if (!api) return []
  const sitemaps = (await api.wordSitemaps()).data
  return sitemaps.map(sitemap => `/sitemaps/dictionary/${sitemap.number}.xml`)
}

export const wordUrl = (entSeq: number, slug: string) =>
  absoluteUrl(encodeURI(`/dictionary/${slug}-${entSeq}/`))

export async function wordSitemapResponse(request: Request, number: number) {
  const api = await dictionaryService()
  if (!api) return null
  const sitemaps = await api.wordSitemaps()
  const range = sitemaps.data.find(sitemap => sitemap.number === number)
  if (!range) return null
  async function* pages(): AsyncGenerator<SitemapEntry[]> {
    let after = range ? range.firstEntSeq - 1 : 0
    for (;;) {
      const rows = (await api?.sitemapWords(number, after, wordsPerQuery))?.data ?? []
      if (rows.length === 0) return
      yield rows.map(row => ({ url: wordUrl(row.entSeq, row.slug) }))
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
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default
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
