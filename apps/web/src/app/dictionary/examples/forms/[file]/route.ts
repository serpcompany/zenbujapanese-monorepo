import type { NextRequest } from 'next/server'
import { getFormExamples } from '@/lib/dictionary/data'
import {
  examplesNotFound,
  examplesResponse,
  morePosition,
  pathSpelling
} from '@/lib/dictionary/example-routes'

export async function GET(request: NextRequest) {
  const form = pathSpelling(
    request.nextUrl.pathname,
    /^\/dictionary\/examples\/forms\/([^/]+)\.json$/
  )
  const from = morePosition(request.nextUrl.searchParams.get('from'))
  if (form === null || from === null) return examplesNotFound()
  const build = request.nextUrl.searchParams.get('build') ?? ''
  const examples = await getFormExamples(form, from, build)
  return examples ? examplesResponse(examples) : examplesNotFound()
}
