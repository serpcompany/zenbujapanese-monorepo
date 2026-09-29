import { dictionarySitemapPaths } from '@/lib/dictionary/sitemaps'
import { childSitemaps, sitemapIndexXml, xmlResponse } from '@/lib/sitemap'

// Lists the dictionary's sitemaps too wherever the site has a dictionary service, so it renders
// per request.
// Never prerendered: the dictionary's sitemaps come from the dictionary service at request time,
// and a build can't reach it (with SITE_ENV=staging, prerendering would fail the build or freeze
// an index without them).
export const dynamic = 'force-dynamic'

export async function GET() {
  return xmlResponse(sitemapIndexXml([...childSitemaps, ...(await dictionarySitemapPaths())]))
}
