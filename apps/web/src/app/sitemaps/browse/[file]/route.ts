import { notFound } from 'next/navigation'
import { browseSitemapResponse } from '@/lib/dictionary/sitemaps'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: RouteContext<'/sitemaps/browse/[file]'>) {
  const group = (await params).file.match(/^([a-z-]+)\.xml$/)?.[1]
  const response = group ? await browseSitemapResponse(request, group) : null
  if (!response) notFound()
  return response
}
