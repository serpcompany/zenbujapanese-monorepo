import { sitePages } from '@/lib/pages'
import { absoluteUrl, servedOrigin } from '@/lib/site'
import { urlSetXml, xmlResponse } from '@/lib/sitemap'

export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  const origin = servedOrigin(request)
  return xmlResponse(urlSetXml(sitePages.map(page => ({ url: absoluteUrl(page.path, origin) }))))
}
