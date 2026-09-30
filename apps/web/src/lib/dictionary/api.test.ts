import { describe, expect, test } from 'vitest'
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
  test("names the build a healthy service answers with, and doesn't send the token", async () => {
    const { api, requests } = serviceAnswering(
      Response.json({ status: 'ok', build: 'e13452e70d34-0123456789ab' })
    )
    expect(await api.health()).toEqual({
      status: 200,
      build: 'e13452e70d34-0123456789ab',
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
    expect(await api.health()).toEqual({ status: 403, build: null, mitigated: 'challenge' })
  })

  test('has no build while the service starts', async () => {
    const { api } = serviceAnswering(Response.json({ status: 'starting' }, { status: 503 }))
    expect(await api.health()).toEqual({ status: 503, build: null, mitigated: null })
  })
})
