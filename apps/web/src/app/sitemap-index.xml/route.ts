import { dictionarySitemapPaths } from '@/lib/dictionary/sitemaps'
import { childSitemaps, sitemapIndexXml, xmlResponse } from '@/lib/sitemap'

// Lists the dictionary's sitemaps too where its database is loaded, so it renders per request.
// Never prerendered: the dictionary's sitemaps depend on the database bound at request time, and a
// build has none (with SITE_ENV=staging, prerendering would fail the build or freeze an index
// without them).
export const dynamic = 'force-dynamic'

export async function GET() {
  return xmlResponse(sitemapIndexXml([...childSitemaps, ...(await dictionarySitemapPaths())]))
}
