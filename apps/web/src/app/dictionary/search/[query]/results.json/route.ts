import type { NextRequest } from 'next/server'
import { getSearchRows } from '@/lib/dictionary/data'
import { resultsPerPage } from '@/lib/dictionary/results/links'
import { searchResultLimit } from '@/lib/dictionary/search/search'
import { decodeSegment, normalizeSearchQuery } from '@/lib/dictionary/urls'

/**
 * `/dictionary/search/<query>/results.json?build=<build>&from=<n>`: the next `resultsPerPage` of
 * a search's words, which its page loads as it scrolls (the page renders the first ones itself).
 * `from` is a multiple of `resultsPerPage` below the app's 60. `build` is the search build the
 * page came from; another build's words are not found, so a page open across a deploy never
 * mixes two builds' lists. Search engines skip it; the search's page is what they index.
 */
export async function GET(
  request: NextRequest,
  context: RouteContext<'/dictionary/search/[query]/results.json'>
) {
  const { query: segment } = await context.params
  const query = normalizeSearchQuery(decodeSegment(segment))
  const from = Number(request.nextUrl.searchParams.get('from') ?? resultsPerPage)
  if (
    !query ||
    query !== decodeSegment(segment) ||
    !Number.isInteger(from) ||
    from <= 0 ||
    from >= searchResultLimit ||
    from % resultsPerPage !== 0
  ) {
    return notFound()
  }
  const build = request.nextUrl.searchParams.get('build') ?? ''
  const rows = await getSearchRows(query, from, build)
  if (!rows) return notFound()
  return Response.json(
    { rows },
    {
      headers: {
        // The URL names the build, so its words never change.
        'Cache-Control': 'public, max-age=86400',
        'X-Robots-Tag': 'noindex'
      }
    }
  )
}

function notFound() {
  return Response.json(
    { error: 'Not found' },
    { status: 404, headers: { 'X-Robots-Tag': 'noindex' } }
  )
}
