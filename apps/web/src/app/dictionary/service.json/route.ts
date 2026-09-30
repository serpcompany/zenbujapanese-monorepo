import { dictionaryService } from '@/lib/dictionary/data'

// Never cached: it answers for the service as it is now.
export const dynamic = 'force-dynamic'

const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }

/**
 * `/dictionary/service.json`: whether this site's Worker reaches its dictionary service, and the
 * build the service answers with. CI reads it through the site's workers.dev address (smoke.sh,
 * and the Dictionary API deploy workflow's await-build.sh), since Bot Fight Mode on the zone
 * challenges CI runners that ask the service directly; it also proves the Worker isn't
 * challenged. It answers 502 when the Worker can't reach the service, with what it got, and 404
 * where the site reads no service (local fixtures). Search engines skip it.
 */
export async function GET() {
  try {
    const api = await dictionaryService()
    if (!api) {
      return Response.json(
        { error: 'This site reads no dictionary service' },
        { status: 404, headers }
      )
    }
    const health = await api.health()
    return Response.json(health, { status: health.status === 200 ? 200 : 502, headers })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json({ status: 0, build: null, error: message }, { status: 502, headers })
  }
}
