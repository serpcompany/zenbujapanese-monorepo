import type { NextRequest } from 'next/server'
import { getConjugationExamples } from '@/lib/dictionary/data'
import { examplesNotFound, examplesResponse, pathText } from '@/lib/dictionary/example-routes'

/** How long a form's examples are kept: they name no build, so a new one shows within this long. */
const cacheSeconds = 3_600

/**
 * `/dictionary/conjugations/<form>.json`: a conjugated form's examples, which its screen in the
 * conjugation sheet loads when it opens (ConjugatedFormView's examples): all of them at once, as
 * the app lists them, at most 100. The form is read from the path as sent.
 */
export async function GET(request: NextRequest) {
  const form = pathText(request.nextUrl.pathname, /^\/dictionary\/conjugations\/([^/]+)\.json$/)
  if (form === null) return examplesNotFound()
  return examplesResponse(await getConjugationExamples(form), cacheSeconds)
}
