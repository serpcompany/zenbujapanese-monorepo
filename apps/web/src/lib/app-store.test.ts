import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { appStoreLookupUrl, appStoreRelease, readAppStoreLookup } from './app-store'

const liveApp = {
  resultCount: 1,
  results: [
    {
      trackName: 'Zenbu Japanese',
      bundleId: 'com.zenbujapanese.app',
      version: '1.0.1',
      minimumOsVersion: '26.0',
      price: 0
    }
  ]
}

describe('reading the App Store lookup', () => {
  test('takes the version and the minimum iOS from the first result', () => {
    expect(readAppStoreLookup(liveApp)).toEqual({ version: '1.0.1', minimumOsVersion: '26.0' })
  })

  test.each([
    ['no results, as before the app is on the store', { resultCount: 0, results: [] }],
    ['a result without a version', { results: [{ minimumOsVersion: '26.0' }] }],
    ['a result without a minimum iOS', { results: [{ version: '1.0.1' }] }],
    ['blank values', { results: [{ version: ' ', minimumOsVersion: '' }] }],
    ['values that are not text', { results: [{ version: 1, minimumOsVersion: 26 }] }],
    ['results that are not a list', { results: { version: '1.0.1' } }],
    ['an answer that is not an object', 'Service unavailable'],
    ['no answer', null]
  ])('finds nothing in %s', (_, answer) => {
    expect(readAppStoreLookup(answer)).toBeNull()
  })
})

type Fetcher = (request: Request) => Promise<Response>

function keptAnswers() {
  const kept = new Map<string, Response>()
  vi.stubGlobal('caches', {
    default: {
      match: async (key: Request) => kept.get(key.url)?.clone(),
      put: async (key: Request, response: Response) => {
        kept.set(key.url, response)
      }
    }
  })
  return kept
}

describe('asking Apple', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const warnings = () =>
    vi.mocked(console.log).mock.calls.map(([line]) => JSON.parse(String(line)) as unknown)

  test('asks for the app by its bundle ID and keeps the answer at the edge for a day', async () => {
    const kept = keptAnswers()
    const fetcher = vi.fn<Fetcher>(async () => Response.json(liveApp))
    expect(await appStoreRelease(fetcher)).toEqual({ version: '1.0.1', minimumOsVersion: '26.0' })
    expect(await appStoreRelease(fetcher)).toEqual({ version: '1.0.1', minimumOsVersion: '26.0' })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0][0].url).toBe(
      'https://itunes.apple.com/lookup?bundleId=com.zenbujapanese.app'
    )
    expect(kept.get(appStoreLookupUrl)?.headers.get('Cache-Control')).toBe('public, max-age=86400')
    expect(console.log).not.toHaveBeenCalled()
  })

  test('works without an edge cache, as in local development', async () => {
    expect(await appStoreRelease(async () => Response.json(liveApp))).toEqual({
      version: '1.0.1',
      minimumOsVersion: '26.0'
    })
  })

  test('finds nothing, without a warning, while the app is not on the store', async () => {
    expect(await appStoreRelease(async () => Response.json({ resultCount: 0, results: [] }))).toBe(
      null
    )
    expect(console.log).not.toHaveBeenCalled()
  })

  test.each<[string, Fetcher]>([
    [
      'Apple cannot be reached',
      async () => {
        throw new TypeError('fetch failed')
      }
    ],
    ['Apple answers with an error', async () => new Response('Busy', { status: 503 })],
    ['Apple answers with something other than JSON', async () => new Response('<html>')]
  ])('finds nothing when %s, logs a warning, and keeps nothing', async (_, fetcher) => {
    const kept = keptAnswers()
    expect(await appStoreRelease(fetcher)).toBeNull()
    expect(kept.size).toBe(0)
    expect(warnings()).toEqual([
      expect.objectContaining({ level: 'warn', message: 'app_store_lookup_failed' })
    ])
  })
})
