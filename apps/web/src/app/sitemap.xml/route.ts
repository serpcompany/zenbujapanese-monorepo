import { dictionarySitemapPaths } from '@/lib/dictionary/sitemaps'
import { childSitemaps, sitemapIndexXml, xmlResponse } from '@/lib/sitemap'

// Crawlers look for /sitemap.xml by default; it serves the same index as /sitemap-index.xml.
// Never prerendered: the dictionary's sitemaps depend on the database bound at request time, and a
// build has none (with SITE_ENV=staging, prerendering would fail the build or freeze an index
// without them).
export const dynamic = 'force-dynamic'

export async function GET() {
  return xmlResponse(sitemapIndexXml([...childSitemaps, ...(await dictionarySitemapPaths())]))
}
