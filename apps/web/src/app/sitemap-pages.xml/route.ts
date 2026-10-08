import { pagesSitemapPaths } from '@/lib/pages-sitemap'
import { pathsSitemapResponse } from '@/lib/sitemap'

export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  return pathsSitemapResponse(pagesSitemapPaths, request)
}
