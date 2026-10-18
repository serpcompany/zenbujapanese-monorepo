import { pathsSitemapResponse } from '@/lib/sitemap'
import { toolPages } from '@/lib/tools/converters'

export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  return pathsSitemapResponse(
    toolPages.map(page => page.path),
    request
  )
}
