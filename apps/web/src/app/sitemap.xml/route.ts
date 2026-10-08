import { sitemapIndexResponse } from '@/lib/sitemap-index'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return sitemapIndexResponse(request)
}
