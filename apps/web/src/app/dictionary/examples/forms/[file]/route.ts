import type { NextRequest } from 'next/server'
import { getFormExamples } from '@/lib/dictionary/data'
import { examplesPerPage } from '@/lib/dictionary/detail/examples'
import { exampleLimit } from '@/lib/dictionary/examples/retrieval'
import { decodeSegment } from '@/lib/dictionary/urls'

/**
 * `/dictionary/examples/forms/<form>.json?build=<build>&from=<n>`: the next `examplesPerPage` of a
 * conjugated form's examples, by the form's spelling, which its page loads as it scrolls, as a
 * word's page loads more from `/dictionary/examples/<ent_seq>.json`. `from` is a multiple of
 * `examplesPerPage` below the app's limit of 100, and another build's examples are not found. A
 * form without examples has none. Search engines skip it; the form's page is what they index.
 */
export async function GET(
  request: NextRequest,
  context: RouteContext<'/dictionary/examples/forms/[file]'>
) {
  const { file } = await context.params
  const match = /^(.+)\.json$/u.exec(decodeSegment(file))
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
  const examples = await getFormExamples(match[1], from, build)
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
