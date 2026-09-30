import { dictionaryService } from '@/lib/dictionary/data'

export const dynamic = 'force-dynamic'

const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }

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
    const kind = error instanceof Error ? error.name : 'Error'
    return Response.json({ status: 0, build: null, error: kind }, { status: 502, headers })
  }
}
