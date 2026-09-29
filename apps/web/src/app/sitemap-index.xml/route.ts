import { dictionarySitemapPaths } from '@/lib/dictionary/sitemaps'
import { childSitemaps, sitemapIndexXml, xmlResponse } from '@/lib/sitemap'

// Lists the dictionary's sitemaps too where its database is loaded, so it renders per request.
export async function GET() {
  return xmlResponse(sitemapIndexXml([...childSitemaps, ...(await dictionarySitemapPaths())]))
}
