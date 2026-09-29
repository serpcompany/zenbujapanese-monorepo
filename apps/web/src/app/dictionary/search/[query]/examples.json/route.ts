import type { NextRequest } from 'next/server'
import { getMoreSearchExamples } from '@/lib/dictionary/data'
import { examplesPerPage } from '@/lib/dictionary/detail/examples'
import { exampleLimit } from '@/lib/dictionary/examples/retrieval'
import { decodeSegment, normalizeSearchQuery } from '@/lib/dictionary/urls'

/**
 * `/dictionary/search/<query>/examples.json?build=<build>&from=<n>`: the next `examplesPerPage` of
 * a search's example sentences, which its Example Sentences page loads as it scrolls, as a word
 * page loads its own (/dictionary/examples/<ent_seq>.json). `from` is a multiple of
 * `examplesPerPage` below the app's limit of 100. `build` is the search build the page came from;
 * another build's are not found. Search engines skip it; the page is what they index.
 */
export async function GET(
  request: NextRequest,
  context: RouteContext<'/dictionary/search/[query]/examples.json'>
) {
  const { query: segment } = await context.params
  const query = normalizeSearchQuery(decodeSegment(segment))
  const from = Number(request.nextUrl.searchParams.get('from') ?? examplesPerPage)
  if (
    !query ||
    query !== decodeSegment(segment) ||
    !Number.isInteger(from) ||
    from <= 0 ||
    from >= exampleLimit ||
    from % examplesPerPage !== 0
  ) {
    return notFound()
  }
  const build = request.nextUrl.searchParams.get('build') ?? ''
  const examples = await getMoreSearchExamples(query, from, build)
  if (!examples) return notFound()
  return Response.json(
    { examples },
    {
      headers: {
        // The URL names the build, so its examples never change.
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
