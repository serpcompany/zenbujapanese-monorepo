import { dictionaryContract } from '@zenbu/dictionary-core/artifact/contract'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { DictionaryApi, ServiceHealth } from '@/lib/dictionary/api'
import { dictionaryService } from '@/lib/dictionary/data'
import { GET } from './route'

vi.mock('@/lib/dictionary/data', () => ({ dictionaryService: vi.fn() }))

const service = (health: () => Promise<ServiceHealth>) => ({ health }) as unknown as DictionaryApi

const build = 'e13452e70d34-0123456789ab'

function answering(health: () => Promise<ServiceHealth>, stream: 'log' | 'error' = 'log') {
  vi.mocked(dictionaryService).mockResolvedValue(service(health))
  return vi.spyOn(console, stream).mockImplementation(() => {})
}

const healthy = (contract: number) => async () => ({
  status: 200,
  build,
  contract,
  mitigated: null
})

describe('GET /dictionary/service.json', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  test('names the build the service answers with, uncached and out of search engines', async () => {
    const logged = answering(healthy(dictionaryContract))
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 200,
      build,
      contract: dictionaryContract,
      mitigated: null,
      siteContract: dictionaryContract
    })
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex')
    expect(logged).not.toHaveBeenCalled()
  })

  test('still answers 200 when the service answers another contract, and logs it', async () => {
    const logged = answering(healthy(dictionaryContract + 1))
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      contract: dictionaryContract + 1,
      siteContract: dictionaryContract
    })
    expect(JSON.parse(logged.mock.calls[0][0] as string)).toMatchObject({
      level: 'warn',
      message: 'dictionary_contract_mismatch',
      service: dictionaryContract + 1,
      site: dictionaryContract
    })
  })

  test('answers 502 when Cloudflare challenges the Worker, saying so', async () => {
    const logged = answering(async () => ({
      status: 403,
      build: null,
      contract: null,
      mitigated: 'challenge'
    }))
    const response = await GET()
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ status: 403, mitigated: 'challenge' })
    expect(JSON.parse(logged.mock.calls[0][0] as string)).toMatchObject({
      level: 'warn',
      message: 'dictionary_service_unhealthy',
      status: 403,
      mitigated: 'challenge'
    })
  })

  test('answers 502 when the service is unreachable, with the kind of failure but not its message', async () => {
    const logged = answering(async () => {
      throw new TypeError('fetch failed: connect ECONNREFUSED 10.0.0.5:8788')
    }, 'error')
    const response = await GET()
    expect(response.status).toBe(502)
    const body = await response.json()
    expect(body).toEqual({ status: 0, build: null, error: 'TypeError' })
    expect(JSON.stringify(body)).not.toContain('10.0.0.5')
    expect(JSON.parse(logged.mock.calls[0][0] as string)).toMatchObject({
      level: 'error',
      message: 'dictionary_service_unreachable',
      error: 'fetch failed: connect ECONNREFUSED 10.0.0.5:8788'
    })
  })

  test('is not found where the site reads no service', async () => {
    vi.mocked(dictionaryService).mockResolvedValue(null)
    expect((await GET()).status).toBe(404)
  })
})
