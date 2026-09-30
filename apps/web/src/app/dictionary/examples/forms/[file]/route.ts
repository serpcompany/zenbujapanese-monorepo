import type { NextRequest } from 'next/server'
import { getFormExamples } from '@/lib/dictionary/data'
import {
  examplesNotFound,
  examplesResponse,
  morePosition,
  pathSpelling
} from '@/lib/dictionary/example-routes'

/**
 * `/dictionary/examples/forms/<form>.json?build=<build>&from=<n>`: the next `examplesPerPage` of a
 * conjugated form's examples, by the form's spelling as written, which its page loads as it
 * scrolls, as a word's page loads more from `/dictionary/examples/<ent_seq>.json`. `from` is a
 * multiple of `examplesPerPage` below the app's limit of 100, and another build's examples are not
 * found. A form without examples has none. Search engines skip it; the form's page is what they
 * index.
 */
export async function GET(request: NextRequest) {
  const form = pathSpelling(
    request.nextUrl.pathname,
    /^\/dictionary\/examples\/forms\/([^/]+)\.json$/
  )
  const from = morePosition(request.nextUrl.searchParams.get('from'))
  if (form === null || from === null) return examplesNotFound()
  const build = request.nextUrl.searchParams.get('build') ?? ''
  const examples = await getFormExamples(form, from, build)
  // The URL names the build, so its examples never change.
  return examples ? examplesResponse(examples) : examplesNotFound()
}
