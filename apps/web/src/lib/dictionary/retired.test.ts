import { describe, expect, test, vi } from 'vitest'
import type { DictionaryApi } from './api'
import { apiRetiredLookup, retiredWordResponse, retiredWordsLookup } from './retired'

// Fixture retired entries until the pipeline (#463) records real ones: 1000010 is retired with no
// replacement, 1000020 is replaced by 1259290 (見る), and 1000030's replacement isn't in this
// release.
const retired = { 1000010: null, 1000020: 1259290, 1000030: 9999999 }
const slugs = new Map([[1259290, '見る']])

/** A dictionary service holding the fixture entries; `failing` makes every call fail. */
function fakeApi({ failing = false } = {}) {
  const api = {
    retired: vi.fn(async () => {
      if (failing) throw new Error('The dictionary service answered 503 for /v1/retired')
      return { data: retired, build: 'test' }
    }),
    word: vi.fn(async (entSeq: number) => {
      const slug = slugs.get(entSeq)
      return slug ? { data: { slug }, build: 'test' } : null
    })
  }
  return api as unknown as DictionaryApi & typeof api
}

const at = (path: string) => new URL(`https://staging.zenbujapanese.com${path}`)

describe('retiredWordResponse', () => {
  test('a retired word with no replacement is gone (410), and kept out of search engines', async () => {
    const response = await retiredWordResponse(
      at('/dictionary/1000010/'),
      apiRetiredLookup(fakeApi())
    )
    expect(response?.status).toBe(410)
    expect(response?.headers.get('X-Robots-Tag')).toBe('noindex')
  })

  test('under any slug', async () => {
    const response = await retiredWordResponse(
      at(`/dictionary/${encodeURIComponent('旧')}-1000010/`),
      apiRetiredLookup(fakeApi())
    )
    expect(response?.status).toBe(410)
  })

  test('a replaced word redirects (308) to its replacement, in one hop to the canonical URL', async () => {
    const response = await retiredWordResponse(
      at('/dictionary/old-1000020/'),
      apiRetiredLookup(fakeApi())
    )
    expect(response?.status).toBe(308)
    expect(response?.headers.get('Location')).toBe(
      'https://staging.zenbujapanese.com/dictionary/%E8%A6%8B%E3%82%8B-1259290/'
    )
  })

  test('a replacement this release lacks leaves the word gone', async () => {
    const response = await retiredWordResponse(
      at('/dictionary/1000030/'),
      apiRetiredLookup(fakeApi())
    )
    expect(response?.status).toBe(410)
  })

  test.each([
    '/dictionary/%E8%A6%8B%E3%82%8B-1259290/',
    '/dictionary/999999999/',
    '/dictionary/kanji/%E8%A6%8B/',
    '/dictionary/search/eat/',
    '/dictionary/',
    '/sitemaps/dictionary/1.xml'
  ])('leaves %s to the app', async path => {
    expect(await retiredWordResponse(at(path), apiRetiredLookup(fakeApi()))).toBeNull()
  })

  test('asks the service for retired entries once per isolate', async () => {
    const api = fakeApi()
    const lookup = apiRetiredLookup(api)
    await retiredWordResponse(at('/dictionary/1000010/'), lookup)
    await retiredWordResponse(at('/dictionary/1259290/'), lookup)
    expect(api.retired).toHaveBeenCalledTimes(1)
  })

  test('a service that fails leaves the request to the app, which reports the failure', async () => {
    expect(
      await retiredWordResponse(
        at('/dictionary/1000010/'),
        apiRetiredLookup(fakeApi({ failing: true }))
      )
    ).toBeNull()
  })
})

describe('retiredWordsLookup', () => {
  test('wherever the site has a dictionary service, production included', () => {
    expect(
      retiredWordsLookup({
        DICTIONARY_API_URL: 'https://dictionary.example',
        DICTIONARY_API_TOKEN: 'token'
      })
    ).not.toBeNull()
    expect(retiredWordsLookup({})).toBeNull()
  })
})
