import type { NextRequest } from 'next/server'
import { examplesNotFound, servesFilesIn } from '@/lib/dictionary/example-routes'
import { pagesAnswer } from '@/lib/dictionary/pages-answer'

export async function GET(
  request: NextRequest,
  context: RouteContext<'/[locale]/dictionary/pages.json'>
) {
  if (!servesFilesIn((await context.params).locale)) return examplesNotFound()
  return pagesAnswer(request.nextUrl.searchParams)
}
