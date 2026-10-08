import { absoluteUrl } from './site'

export type SitemapEntry = { url: string; lastModified?: Date }

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function lastmod(date: Date | undefined) {
  return date ? `<lastmod>${date.toISOString()}</lastmod>` : ''
}

export const childSitemaps = ['/sitemap-pages.xml'] as const

export type PathRule = { source: string; destination: string }

export function withSlashedSources(rules: readonly PathRule[]): PathRule[] {
  return rules.flatMap(rule => [rule, { ...rule, source: `${rule.source}/` }])
}

export const movedSitemaps = withSlashedSources([
  { source: '/sitemap.xml', destination: '/sitemap-index.xml' },
  { source: '/sitemaps/pages.xml', destination: '/sitemap-pages.xml' }
])

export function sitemapIndexXml(paths: readonly string[], origin: string) {
  const items = paths
    .map(path => `<sitemap><loc>${escapeXml(absoluteUrl(path, origin))}</loc></sitemap>`)
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items}</sitemapindex>`
}

const urlSetOpen =
  '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
const urlSetClose = '</urlset>'

function urlItems(entries: readonly SitemapEntry[]) {
  return entries
    .map(entry => `<url><loc>${escapeXml(entry.url)}</loc>${lastmod(entry.lastModified)}</url>`)
    .join('')
}

export function urlSetXml(entries: readonly SitemapEntry[]) {
  return `${urlSetOpen}${urlItems(entries)}${urlSetClose}`
}

export function urlSetStream(pages: AsyncIterable<readonly SitemapEntry[]>) {
  const encoder = new TextEncoder()
  const iterator = pages[Symbol.asyncIterator]()
  let opened = false
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!opened) {
        opened = true
        controller.enqueue(encoder.encode(urlSetOpen))
        return
      }
      const { done, value } = await iterator.next()
      if (done) {
        controller.enqueue(encoder.encode(urlSetClose))
        controller.close()
        return
      }
      controller.enqueue(encoder.encode(urlItems(value)))
    },
    async cancel() {
      await iterator.return?.()
    }
  })
}

export function xmlResponse(body: BodyInit) {
  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  })
}
