import { getCloudflareContext } from '@opennextjs/cloudflare'
import { absoluteUrl } from '@/lib/site'
import { type SitemapEntry, urlSetStream, urlSetXml, xmlResponse } from '@/lib/sitemap'
import { dictionaryService } from './data'
import { conjugationsPath, kanjiPath } from './urls'

const wordsPerQuery = 10_000

export async function dictionarySitemapPaths(): Promise<string[]> {
  const api = await dictionaryService()
  if (!api) return []
  const sitemaps = (await api.wordSitemaps()).data
  return [
    ...sitemaps.map(sitemap => `/sitemaps/dictionary/${sitemap.number}.xml`),
    '/sitemaps/kanji.xml',
    '/sitemaps/conjugations.xml'
  ]
}

export const wordUrl = (entSeq: number, slug: string) =>
  absoluteUrl(encodeURI(`/dictionary/${slug}-${entSeq}/`))

export const kanjiUrl = (character: string) => absoluteUrl(encodeURI(kanjiPath(character)))

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

export async function kanjiSitemapResponse(request: Request) {
  const api = await dictionaryService()
  if (!api) return null
  const { data: characters, build } = await api.indexableKanji()
  return cachedForBuild(request, build, () =>
    xmlResponse(urlSetXml(characters.map(character => ({ url: kanjiUrl(character) }))))
  )
}

export async function conjugationSitemapResponse(request: Request) {
  const api = await dictionaryService()
  if (!api) return null
  const answer = await api.conjugationSitemap()
  if (!answer) {
    return new Response('The conjugations sitemap is still being worked out.', {
      status: 503,
      headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' }
    })
  }
  return cachedForBuild(request, answer.build, () =>
    xmlResponse(
      urlSetXml(
        answer.data.flatMap(({ entSeq, slug, forms }) => {
          const table = conjugationsPath(`/dictionary/${slug}-${entSeq}/`)
          return [table, ...forms.map(form => `${table}${form}/`)].map(path => ({
            url: absoluteUrl(encodeURI(path))
          }))
        })
      )
    )
  )
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
