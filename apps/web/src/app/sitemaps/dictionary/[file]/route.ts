import { notFound } from 'next/navigation'
import { wordSitemapResponse } from '@/lib/dictionary/sitemaps'

export async function GET(
  request: Request,
  { params }: RouteContext<'/sitemaps/dictionary/[file]'>
) {
  const match = (await params).file.match(/^([1-9]\d*)\.xml$/)
  const response = match ? await wordSitemapResponse(request, Number(match[1])) : null
  if (!response) notFound()
  return response
}
