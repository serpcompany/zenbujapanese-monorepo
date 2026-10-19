import { pathsSitemapResponse } from '@/lib/sitemap'
import { toolPaths } from '@/lib/tools/paths'

export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  return pathsSitemapResponse(toolPaths, request)
}
