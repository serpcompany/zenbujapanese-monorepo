import type { NextRequest } from 'next/server'
import { examplesNotFound, servesFilesIn } from '@/lib/dictionary/example-routes'
import { furiganaAnswer } from '@/lib/dictionary/furigana'

export async function GET(
  request: NextRequest,
  context: RouteContext<'/[locale]/tools/furigana.json'>
) {
  if (!servesFilesIn((await context.params).locale)) return examplesNotFound()
  return furiganaAnswer(request.nextUrl.searchParams.get('text') ?? '')
}
