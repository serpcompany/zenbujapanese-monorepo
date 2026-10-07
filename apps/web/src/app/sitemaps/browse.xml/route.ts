import { notFound } from 'next/navigation'
import { browseSitemapResponse } from '@/lib/dictionary/sitemaps'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const response = await browseSitemapResponse(request)
  if (!response) notFound()
  return response
}
