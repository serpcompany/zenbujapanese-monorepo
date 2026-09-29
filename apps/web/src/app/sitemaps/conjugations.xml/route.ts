import { notFound } from 'next/navigation'
import { conjugationSitemapResponse } from '@/lib/dictionary/sitemaps'

/** `/sitemaps/conjugations.xml`: every conjugation table, and the form pages search engines may index. */
export async function GET(request: Request) {
  const response = await conjugationSitemapResponse(request)
  if (!response) notFound()
  return response
}
