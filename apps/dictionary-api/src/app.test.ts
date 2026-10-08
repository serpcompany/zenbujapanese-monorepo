import { dictionaryContract } from '@zenbu/dictionary-core/artifact/contract'
import { servedByAccountService } from '@zenbu/node-service/api-host'
import { describe, expect, test, vi } from 'vitest'
import { createApp } from './app'
import { fakeService, info } from './conformance/fake-service'

const token = 'test-token-0123456789'
function app(service = fakeService(), ready = true) {
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  return createApp({ service, token, ready: () => ready })
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

  test('passes a kana list, its script, and its page on', async () => {
    const kanaWords = vi.fn(fakeService().kanaWords)
    const path = `/v1/browse/kana/hiragana/${encodeURIComponent('か')}/${encodeURIComponent('かが')}`
    await app(fakeService({ kanaWords })).request(get(`${path}?page=2`))
    expect(kanaWords).toHaveBeenCalledWith('hiragana', 'かが', 2)
  })

  test('passes a category, its order, and its first page on by default', async () => {
    const categoryWords = vi.fn(fakeService().categoryWords)
    const service = fakeService({ categoryWords })
    expect((await app(service).request(get('/v1/browse/categories/nouns'))).status).toBe(200)
    expect(categoryWords).toHaveBeenCalledWith('nouns', 'used', 1)
    await app(service).request(get('/v1/browse/categories/nouns?order=kana&page=3'))
    expect(categoryWords).toHaveBeenCalledWith('nouns', 'kana', 3)
  })

  test.each([
    ['an order other than used or kana', '/v1/browse/categories/nouns?order=rank'],
    ['a page that is not a number', '/v1/browse/ranked/youtube?page=two']
  ])('400s %s', async (_, path) => {
    expect((await app().request(get(path))).status).toBe(400)
  })

  test.each([
    ['a script other than hiragana or katakana', '/v1/browse/kana/romaji'],
    [
      'a prefix that does not start with its kana',
      `/v1/browse/kana/hiragana/か/${encodeURIComponent('きゃ')}`
    ],
    ['an unknown category', '/v1/browse/categories/nothing'],
    ['an unknown kanji list', '/v1/browse/kanji/grade-9']
  ])('404s %s', async (_, path) => {
    expect((await app().request(get(path))).status).toBe(404)
  })

  test.each([
    '/v1/nothing',
    '/v1/words/1358280/conjugations',
    '/v1/sitemaps/kanji',
    '/v1/sitemaps/conjugations'
  ])('404s %s, a route it has no longer or never had', async path => {
    expect((await app().request(get(path))).status).toBe(404)
  })
})

describe('on the API host', () => {
  test('answers no path nginx sends to the account service, so the two never collide', () => {
    const paths = app()
      .routes.map(route => route.path)
      .filter(path => path !== '/*' && path !== '/v1/*')
    expect(paths.length).toBeGreaterThan(5)
    expect(paths.filter(servedByAccountService)).toEqual([])
  })
})
