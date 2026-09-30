import type { NextRequest } from 'next/server'
import { getWordExamples } from '@/lib/dictionary/data'
import { examplesNotFound, examplesResponse, morePosition } from '@/lib/dictionary/example-routes'

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
  const from = morePosition(request.nextUrl.searchParams.get('from'))
  if (!match || from === null) return examplesNotFound()
  const build = request.nextUrl.searchParams.get('build') ?? ''
  const examples = await getWordExamples(Number(match[1]), from, build)
  // The URL names the build, so its examples never change.
  return examples ? examplesResponse(examples) : examplesNotFound()
}
