import { getCloudflareContext } from '@opennextjs/cloudflare'
import { absoluteUrl } from '@/lib/site'
import { type SitemapEntry, urlSetStream, urlSetXml, xmlResponse } from '@/lib/sitemap'
import { dictionaryService } from './data'
import { kanjiPath } from './urls'

// The dictionary's sitemaps (ADR 0007, #465): `/sitemaps/dictionary/<n>.xml` for word pages, 50,000
// canonical URLs to a file in `ent_seq` order, and `/sitemaps/kanji.xml` for the kanji pages
// search engines may index, from the dictionary service (./api.ts). They exist wherever the site
// has a service: staging and production, not local fixtures. URLs are percent-encoded UTF-8.

/** How many words each query reads while a word sitemap streams. */
const wordsPerQuery = 10_000

/** The dictionary's child sitemaps for the sitemap index; none on local fixtures. */
export async function dictionarySitemapPaths(): Promise<string[]> {
  const api = await dictionaryService()
  if (!api) return []
  const sitemaps = (await api.wordSitemaps()).data
  return [
    ...sitemaps.map(sitemap => `/sitemaps/dictionary/${sitemap.number}.xml`),
    '/sitemaps/kanji.xml'
  ]
}

/** A word page's canonical URL, under its slug. */
export const wordUrl = (entSeq: number, slug: string) =>
  absoluteUrl(encodeURI(`/dictionary/${slug}-${entSeq}/`))

/** A kanji page's canonical URL: the exact character, percent-encoded, never normalized. */
export const kanjiUrl = (character: string) => absoluteUrl(encodeURI(kanjiPath(character)))

/** Word sitemap `number`, streamed a query at a time; null when there's no such sitemap. */
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
  return cached(request, sitemaps.build, () => xmlResponse(urlSetStream(pages())))
}

/** The kanji sitemap: every indexable kanji; null on local fixtures. */
export async function kanjiSitemapResponse(request: Request) {
  const api = await dictionaryService()
  if (!api) return null
  const { data: characters, build } = await api.indexableKanji()
  return cached(request, build, () =>
    xmlResponse(urlSetXml(characters.map(character => ({ url: kanjiUrl(character) }))))
  )
}

/**
 * Serves a sitemap from the Worker's edge cache when it holds this build's copy, and caches a
 * fresh one otherwise, so a new build of the dictionary replaces its sitemaps at once. Worker
 * responses aren't cached by Cloudflare on their own; outside a Worker (`pnpm dev`) there is no
 * cache and each request builds the sitemap.
 */
async function cached(
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
