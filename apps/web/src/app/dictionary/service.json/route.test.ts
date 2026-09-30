import { afterEach, describe, expect, test, vi } from 'vitest'
import type { DictionaryApi, ServiceHealth } from '@/lib/dictionary/api'
import { dictionaryService } from '@/lib/dictionary/data'
import { GET } from './route'

vi.mock('@/lib/dictionary/data', () => ({ dictionaryService: vi.fn() }))

const service = (health: () => Promise<ServiceHealth>) => ({ health }) as unknown as DictionaryApi

describe('GET /dictionary/service.json', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('names the build the service answers with, uncached and out of search engines', async () => {
    vi.mocked(dictionaryService).mockResolvedValue(
      service(async () => ({ status: 200, build: 'e13452e70d34-0123456789ab', mitigated: null }))
    )
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 200,
      build: 'e13452e70d34-0123456789ab',
      mitigated: null
    })
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex')
  })

  test('answers 502 when Cloudflare challenges the Worker, saying so', async () => {
    vi.mocked(dictionaryService).mockResolvedValue(
      service(async () => ({ status: 403, build: null, mitigated: 'challenge' }))
    )
    const response = await GET()
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ status: 403, mitigated: 'challenge' })
  })

  test('answers 502 when the service is unreachable, with why', async () => {
    vi.mocked(dictionaryService).mockResolvedValue(
      service(async () => {
        throw new Error('connection refused')
      })
    )
    const response = await GET()
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ error: 'connection refused' })
  })

  test('is not found where the site reads no service', async () => {
    vi.mocked(dictionaryService).mockResolvedValue(null)
    expect((await GET()).status).toBe(404)
  })
})
