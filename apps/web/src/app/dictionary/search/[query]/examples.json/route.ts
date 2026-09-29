import type { NextRequest } from 'next/server'
import { getSearchExamples } from '@/lib/dictionary/data'
import {
  examplesNotFound,
  examplesResponse,
  morePosition,
  pathText
} from '@/lib/dictionary/example-routes'

/**
 * `/dictionary/search/<query>/examples.json?build=<build>&from=<n>`: the next `examplesPerPage` of
 * a search's examples, which its examples page (../examples) loads as it scrolls, as the word
 * page's examples load (src/app/dictionary/examples). The query is read from the path as sent, and
 * must be in its normal form, as the page asks for it.
 */
export async function GET(request: NextRequest) {
  const query = pathText(
    request.nextUrl.pathname,
    /^\/dictionary\/search\/([^/]+)\/examples\.json$/
  )
  const from = morePosition(request.nextUrl.searchParams.get('from'))
  if (query === null || from === null) return examplesNotFound()
  const build = request.nextUrl.searchParams.get('build') ?? ''
  const found = await getSearchExamples(query, from, build)
  // The URL names the build, so its examples never change.
  return found ? examplesResponse(found.examples) : examplesNotFound()
}
