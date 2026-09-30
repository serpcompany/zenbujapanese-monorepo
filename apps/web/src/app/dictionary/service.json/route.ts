import { dictionaryContract } from '@zenbu/dictionary-core/artifact/contract'
import { dictionaryService } from '@/lib/dictionary/data'
import { errorFields, log } from '@/lib/log'

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
    if (health.status !== 200) {
      log('warn', 'dictionary_service_unhealthy', {
        status: health.status,
        mitigated: health.mitigated
      })
    } else if (health.contract !== dictionaryContract) {
      log('warn', 'dictionary_contract_mismatch', {
        service: health.contract,
        site: dictionaryContract
      })
    }
    return Response.json(
      { ...health, siteContract: dictionaryContract },
      { status: health.status === 200 ? 200 : 502, headers }
    )
  } catch (error) {
    log('error', 'dictionary_service_unreachable', errorFields(error))
    const kind = error instanceof Error ? error.name : 'Error'
    return Response.json({ status: 0, build: null, error: kind }, { status: 502, headers })
  }
}
