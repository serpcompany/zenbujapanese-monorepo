import { notFound } from 'next/navigation'
import { kanjiElementSitemapResponse } from '@/lib/dictionary/sitemaps'

/** `/sitemaps/kanji-elements.xml`: every kanji element page search engines may index. */
export async function GET(request: Request) {
  const response = await kanjiElementSitemapResponse(request)
  if (!response) notFound()
  return response
}
