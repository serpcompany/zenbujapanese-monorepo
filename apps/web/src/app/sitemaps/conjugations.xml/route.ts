import { notFound } from 'next/navigation'
import { conjugationSitemapResponse } from '@/lib/dictionary/sitemaps'

export async function GET(request: Request) {
  const response = await conjugationSitemapResponse(request)
  if (!response) notFound()
  return response
}
