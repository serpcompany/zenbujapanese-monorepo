import { dictionaryContract } from '@zenbu/dictionary-core/artifact/contract'
import { describe, expect, test, vi } from 'vitest'
import { createApp } from './app'
import type { DictionaryService } from './service'

const token = 'test-token-0123456789'
const info = {
  build: 'e13452e70d34-test',
  artifact: { name: 'LanguageReferenceData.sqlite3', sha256: 'e13452e70d34' },
  features: { sentenceSearch: true }
}

function fakeService(overrides: Partial<DictionaryService> = {}): DictionaryService {
  return {
    info: async () => info,
    search: async query => ({ screen: { state: 'noResults', query }, kanjiHasPage: false }),
    searchExamples: async () => null,
    word: async entSeq => (entSeq === 1358280 ? ({ slug: '食べる' } as never) : null),
    wordExamples: async () => ({ rows: [], slugs: {} }),
    conjugationWord: async entSeq => (entSeq === 1358280 ? ({ slug: '食べる' } as never) : null),
    formExamples: async () => ({ rows: [], listed: 0, slugs: {} }),
    kanji: async character => (character === '要' ? ({ indexable: true } as never) : null),
    wordSitemaps: async () => [],
    sitemapWords: async () => null,
    indexableKanji: async () => ['要'],
    retired: async () => ({}),
    ...overrides
  }
}

function app(service = fakeService(), ready = true, sitemap: unknown[] | null = []) {
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  return createApp({
    service,
    token,
    ready: () => ready,
    conjugationSitemap: () => sitemap as never
  })
}

const get = (path: string, auth = `Bearer ${token}`) =>
  new Request(`http://localhost${path}`, { headers: auth ? { authorization: auth } : {} })

describe('/healthz', () => {
  test('answers 503 until every worker has loaded, then ok with the build', async () => {
    expect((await app(fakeService(), false).request(get('/healthz', ''))).status).toBe(503)
    const response = await app().request(get('/healthz', ''))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'ok',
      build: info.build,
      contract: dictionaryContract,
      features: info.features
    })
  })
})

describe('/v1 needs the token', () => {
  test.each([
    ['no header', ''],
    ['another token', 'Bearer not-the-token-0123456'],
    ['the token without Bearer and a character more', `${token}x`]
  ])('refuses %s', async (_, header) => {
    const response = await app().request(get('/v1/info', header))
    expect(response.status).toBe(401)
  })

  test('answers with it, naming the build and the contract', async () => {
    const response = await app().request(get('/v1/info'))
    expect(response.status).toBe(200)
    expect(response.headers.get('x-dictionary-build')).toBe(info.build)
    expect(response.headers.get('x-dictionary-contract')).toBe(String(dictionaryContract))
    expect(await response.json()).toEqual(info)
  })

  test('answers 503 while starting, even with the token', async () => {
    expect((await app(fakeService(), false).request(get('/v1/info'))).status).toBe(503)
  })
})

describe('routes', () => {
  test('passes the decoded query to search', async () => {
    const search = vi.fn(fakeService().search)
    await app(fakeService({ search })).request(get(`/v1/search/${encodeURIComponent('食べる')}`))
    expect(search).toHaveBeenCalledWith('食べる')
  })

  test('404s a word or kanji the artifact lacks, and answers one it holds', async () => {
    expect((await app().request(get('/v1/words/9'))).status).toBe(404)
    expect((await app().request(get('/v1/words/1358280'))).status).toBe(200)
    expect((await app().request(get(`/v1/kanji/${encodeURIComponent('生')}`))).status).toBe(404)
    expect((await app().request(get(`/v1/kanji/${encodeURIComponent('要')}`))).status).toBe(200)
  })

  test.each([
    ['a word number that is not a number', '/v1/words/abc'],
    ['an examples offset past the 100 listed', '/v1/words/1358280/examples?from=100'],
    ['a query over 200 characters', `/v1/search/${'a'.repeat(201)}`]
  ])('400s %s', async (_, path) => {
    expect((await app().request(get(path))).status).toBe(400)
  })

  test.each([
    ['word number 0', '/v1/words/0'],
    ['a word number past any JMdict entry', '/v1/words/999999999'],
    ["such a word's examples", '/v1/words/999999999/examples?from=25'],
    ['a kanji of two characters', `/v1/kanji/${encodeURIComponent('要る')}`]
  ])('404s %s, which names nothing, as for an unknown one', async (_, path) => {
    const word = vi.fn(fakeService().word)
    const response = await app(fakeService({ word })).request(get(path))
    expect(response.status).toBe(404)
    expect(word).not.toHaveBeenCalled()
  })

  test('passes the examples offset on', async () => {
    const wordExamples = vi.fn(fakeService().wordExamples)
    await app(fakeService({ wordExamples })).request(get('/v1/words/1358280/examples?from=25'))
    expect(wordExamples).toHaveBeenCalledWith(1358280, 25)
  })

  test('answers 500 without detail when the dictionary fails, and logs it', async () => {
    const failing = app(
      fakeService({
        search: async () => {
          throw new Error('database is locked')
        }
      })
    )
    const response = await failing.request(get('/v1/search/x'))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'internal error' })
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('database is locked'))
  })

  test('passes a form and its page of examples on', async () => {
    const formExamples = vi.fn(fakeService().formExamples)
    await app(fakeService({ formExamples })).request(
      get(`/v1/conjugations/${encodeURIComponent('食べた')}/examples?from=25&limit=100`)
    )
    expect(formExamples).toHaveBeenCalledWith('食べた', 25, 100)
  })

  test("404s a word's conjugations when it has no table", async () => {
    expect((await app().request(get('/v1/words/1358280/conjugations'))).status).toBe(200)
    expect((await app().request(get('/v1/words/1206730/conjugations'))).status).toBe(404)
  })

  test('answers 503 for the conjugations sitemap until it has been worked out', async () => {
    const pending = await app(fakeService(), true, null).request(get('/v1/sitemaps/conjugations'))
    expect(pending.status).toBe(503)
    expect(pending.headers.get('retry-after')).toBe('60')
    const done = await app(fakeService(), true, [{ entSeq: 1, slug: 'x', forms: [] }]).request(
      get('/v1/sitemaps/conjugations')
    )
    expect(await done.json()).toEqual([{ entSeq: 1, slug: 'x', forms: [] }])
  })

  test('404s an unknown route', async () => {
    expect((await app().request(get('/v1/nothing'))).status).toBe(404)
  })
})
