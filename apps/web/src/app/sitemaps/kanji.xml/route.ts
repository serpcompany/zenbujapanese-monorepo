import { notFound } from 'next/navigation'
import { kanjiSitemapResponse } from '@/lib/dictionary/sitemaps'

export async function GET(request: Request) {
  const response = await kanjiSitemapResponse(request)
  if (!response) notFound()
  return response
}
