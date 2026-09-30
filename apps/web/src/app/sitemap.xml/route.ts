import { dictionarySitemapPaths } from '@/lib/dictionary/sitemaps'
import { childSitemaps, sitemapIndexXml, xmlResponse } from '@/lib/sitemap'

export const dynamic = 'force-dynamic'

export async function GET() {
  return xmlResponse(sitemapIndexXml([...childSitemaps, ...(await dictionarySitemapPaths())]))
}
