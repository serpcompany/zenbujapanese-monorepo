import type { NextRequest } from 'next/server'
import { getWordExamples } from '@/lib/dictionary/data'
import { examplesPerPage } from '@/lib/dictionary/detail/examples'
import { exampleLimit } from '@/lib/dictionary/examples/retrieval'

/**
 * `/dictionary/examples/<ent_seq>.json?build=<build>&from=<n>`: the next `examplesPerPage` of a
 * word's examples, which its page loads as it scrolls (the page renders the first ones itself).
 * `from` is a multiple of `examplesPerPage` below the app's limit of 100. `build` is the dictionary
 * build the page came from; another build's examples are not found, so a page open across a deploy
 * never mixes two builds' lists. Search engines skip it; the word's page is what they index.
 */
export async function GET(
  request: NextRequest,
  context: RouteContext<'/dictionary/examples/[file]'>
) {
  const { file } = await context.params
  const match = /^(\d+)\.json$/.exec(file)
  const from = Number(request.nextUrl.searchParams.get('from') ?? examplesPerPage)
  if (
    !match ||
    !Number.isInteger(from) ||
    from < 0 ||
    from >= exampleLimit ||
    from % examplesPerPage !== 0
  ) {
    return notFound()
  }
  const build = request.nextUrl.searchParams.get('build') ?? ''
  const examples = await getWordExamples(Number(match[1]), from, build)
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
