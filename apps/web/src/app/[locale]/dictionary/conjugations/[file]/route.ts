import type { NextRequest } from 'next/server'
import { getConjugationExamples } from '@/lib/dictionary/data'
import {
  examplesNotFound,
  examplesResponse,
  pathSpelling,
  servesFilesIn
} from '@/lib/dictionary/example-routes'

const cacheSecondsWithoutBuild = 3_600

export async function GET(
  request: NextRequest,
  context: RouteContext<'/[locale]/dictionary/conjugations/[file]'>
) {
  if (!servesFilesIn((await context.params).locale)) return examplesNotFound()
  const form = pathSpelling(request.nextUrl.pathname, /^\/dictionary\/conjugations\/([^/]+)\.json$/)
  if (form === null) return examplesNotFound()
  return examplesResponse(await getConjugationExamples(form), cacheSecondsWithoutBuild)
}
