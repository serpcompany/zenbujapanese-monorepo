import { dictionaryContract } from '@zenbu/dictionary-core/artifact/contract'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { dictionaryApi } from './api'

const environment = {
  DICTIONARY_API_URL: 'https://dictionary.example.com',
  DICTIONARY_API_TOKEN: 'a-token-of-sixteen-or-more'
}

function serviceAnswering(response: Response) {
  const requests: Request[] = []
  const api = dictionaryApi(environment, async request => {
    requests.push(request)
    return response
  })
  if (!api) throw new Error('expected a service')
  return { api, requests }
}

describe('health', () => {
  test("names the build and contract a healthy service answers with, and doesn't send the token", async () => {
    const { api, requests } = serviceAnswering(
      Response.json({ status: 'ok', build: 'e13452e70d34-0123456789ab', contract: 7 })
    )
    expect(await api.health()).toEqual({
      status: 200,
      build: 'e13452e70d34-0123456789ab',
      contract: 7,
      mitigated: null
    })
    expect(requests.map(request => request.url)).toEqual(['https://dictionary.example.com/healthz'])
    expect(requests[0].headers.get('authorization')).toBeNull()
  })

  test("reports Cloudflare's challenge instead of a build", async () => {
    const { api } = serviceAnswering(
      new Response('<html>Just a moment...</html>', {
        status: 403,
        headers: { 'content-type': 'text/html', 'cf-mitigated': 'challenge' }
      })
    )
    expect(await api.health()).toEqual({
      status: 403,
      build: null,
      contract: null,
      mitigated: 'challenge'
    })
  })

  test('takes a service that names no contract as answering the first one', async () => {
    const { api } = serviceAnswering(Response.json({ status: 'ok', build: 'e13452e70d34-old' }))
    expect((await api.health()).contract).toBe(1)
  })

  test('has no build while the service starts', async () => {
    const { api } = serviceAnswering(Response.json({ status: 'starting' }, { status: 503 }))
    expect(await api.health()).toEqual({
      status: 503,
      build: null,
      contract: null,
      mitigated: null
    })
  })
})

describe('the contract', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function edgeCache() {
    const stored: string[] = []
    vi.stubGlobal('caches', {
      default: {
        match: async () => undefined,
        put: async (key: Request) => {
          stored.push(key.url)
        }
      }
    })
    return stored
  }

  const answering = (contract: number) =>
    serviceAnswering(
      Response.json(['要'], { headers: { 'X-Dictionary-Contract': String(contract) } })
    ).api

  test('caches an answer from its own contract under a key naming the contract', async () => {
    const stored = edgeCache()
    const logged = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect((await answering(dictionaryContract).wordSitemaps()).data).toEqual(['要'])
    expect(stored).toEqual([
      `https://dictionary.example.com/v1/sitemaps/words?contract=${dictionaryContract}`
    ])
    expect(logged).not.toHaveBeenCalled()
  })

  test('still serves an answer from another contract, logging it and leaving it out of the cache', async () => {
    const stored = edgeCache()
    const logged = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect((await answering(dictionaryContract + 1).wordSitemaps()).data).toEqual(['要'])
    expect(stored).toEqual([])
    expect(JSON.parse(logged.mock.calls[0][0] as string)).toMatchObject({
      level: 'warn',
      message: 'dictionary_contract_mismatch',
      path: '/v1/sitemaps/words',
      service: dictionaryContract + 1,
      site: dictionaryContract
    })
  })
})
