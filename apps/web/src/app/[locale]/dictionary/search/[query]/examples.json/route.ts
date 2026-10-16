import type { NextRequest } from 'next/server'
import { getSearchExamples } from '@/lib/dictionary/data'
import {
  examplesNotFound,
  examplesResponse,
  morePosition,
  pathText
} from '@/lib/dictionary/example-routes'

export async function GET(request: NextRequest) {
  const query = pathText(
    request.nextUrl.pathname,
    /^\/dictionary\/search\/([^/]+)\/examples\.json$/
  )
  const from = morePosition(request.nextUrl.searchParams.get('from'))
  if (query === null || from === null) return examplesNotFound()
  const build = request.nextUrl.searchParams.get('build') ?? ''
  const found = await getSearchExamples(query, from, build)
  return found ? examplesResponse(found.examples) : examplesNotFound()
}
