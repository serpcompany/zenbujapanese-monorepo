import { pagesSitemapPaths } from '@/lib/pages-sitemap'
import { absoluteUrl, servedOrigin } from '@/lib/site'
import { urlSetXml, xmlResponse } from '@/lib/sitemap'

export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  const origin = servedOrigin(request)
  return xmlResponse(urlSetXml(pagesSitemapPaths.map(path => ({ url: absoluteUrl(path, origin) }))))
}
