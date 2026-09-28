import { childSitemaps, sitemapIndexXml, xmlResponse } from '@/lib/sitemap'

// Crawlers look for /sitemap.xml by default; it serves the same index as /sitemap-index.xml.
export const dynamic = 'force-static'

export function GET() {
  return xmlResponse(sitemapIndexXml(childSitemaps))
}
