import type { NextRequest } from 'next/server'
import { getWordExamples } from '@/lib/dictionary/data'
import {
  examplesNotFound,
  examplesResponse,
  morePosition,
  servesFilesIn
} from '@/lib/dictionary/example-routes'

export async function GET(
  request: NextRequest,
  context: RouteContext<'/[locale]/dictionary/examples/[file]'>
) {
  const { locale, file } = await context.params
  const match = /^(\d+)\.json$/.exec(file)
  const from = morePosition(request.nextUrl.searchParams.get('from'))
  if (!servesFilesIn(locale) || !match || from === null) return examplesNotFound()
  const build = request.nextUrl.searchParams.get('build') ?? ''
  const examples = await getWordExamples(Number(match[1]), from, build)
  return examples ? examplesResponse(examples) : examplesNotFound()
}
