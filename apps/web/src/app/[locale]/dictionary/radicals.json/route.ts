import { getRadicals } from '@/lib/dictionary/data'
import { examplesNotFound, servesFilesIn } from '@/lib/dictionary/example-routes'

const cacheSeconds = 3_600

export async function GET(
  _request: Request,
  context: RouteContext<'/[locale]/dictionary/radicals.json'>
) {
  if (!servesFilesIn((await context.params).locale)) return examplesNotFound()
  const radicals = await getRadicals()
  if (!radicals) return examplesNotFound()
  return Response.json(radicals, {
    headers: {
      'Cache-Control': `public, max-age=${cacheSeconds}`,
      'X-Robots-Tag': 'noindex'
    }
  })
}
