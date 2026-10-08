import { wordCardLicense, wordCardSources } from '@zenbu/dictionary-core/cards/sources'
import { SignJWT, UnsecuredJWT } from 'jose'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { createApp } from './app'
import { maximumCardsPerRequest, maximumSegmentedLength } from './app-routes'
import { type TestAccountKeys, testAccountKeys } from './conformance/account-keys'
import { fakeService, info } from './conformance/fake-service'
import { perMinute } from './rate-limit'

const serviceToken = 'test-token-0123456789'
const miru = '7f490a9c9c0da94f4e9474f4efe74be1'
const card = { languageReferenceID: miru, headword: '見る' } as never
const segmented = [{ text: '見る', languageReferenceID: miru }]

let keys: TestAccountKeys

beforeAll(async () => {
  keys = await testAccountKeys()
})

const accessToken = (...args: Parameters<TestAccountKeys['accessToken']>) =>
  keys.accessToken(...args)

let answered = 0

afterEach(() => {
  vi.useRealTimers()
})

function app(
  options: {
    limit?: number
    keysAnswer?: () => Response | undefined
    access?: boolean
    failing?: boolean
  } = {}
) {
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  return createApp({
    service: fakeService({
      wordCards: async ids => {
        answered++
        if (options.failing) throw new Error('the worker exited')
        return ids.includes(miru) ? [card] : []
      },
      segment: async () => {
        answered++
        return segmented
      }
    }),
    token: serviceToken,
    ready: () => true,
    access: options.access === false ? null : keys.access(options)
  })
}

const get = (path: string, token?: string, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${path}`, {
    headers: { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) }
  })

const later = (milliseconds: number) =>
  vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + milliseconds })

const keyFailuresLogged = () =>
  vi
    .mocked(process.stderr.write)
    .mock.calls.filter(([line]) => String(line).includes('account keys unavailable')).length

const errorCode = async (response: Response) => [
  response.status,
  ((await response.json()) as { error: { code: string } }).error.code
]

describe('word cards for a signed-in app', () => {
  test('answers the cards in the word-card format, with the language data, and what it lacks', async () => {
    const other = '0'.repeat(32)
    const response = await app().request(
      get(`/v1/apps/word-cards?ids=${miru.toUpperCase()},${other}`, await accessToken())
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      format: 'zenbu.word-cards.v1',
      license: wordCardLicense,
      sources: wordCardSources,
      cards: [card],
      missing: [other],
      languageData: info.languageData
    })
  })

  test('can be cached by the app, and answers 304 for the copy it has', async () => {
    const token = await accessToken()
    const path = `/v1/apps/word-cards?ids=${miru}`
    const first = await app().request(get(path, token))
    expect(first.headers.get('cache-control')).toBe('private, max-age=86400')
    const tag = first.headers.get('etag') ?? ''
    expect(tag).toBe(`"${info.build}"`)
    for (const asked of [tag, `W/${tag}`, `"other", W/${tag}`, '*']) {
      const before = answered
      const again = await app().request(get(path, token, { 'if-none-match': asked }))
      expect(again.status, asked).toBe(304)
      expect(answered, 'a 304 reads no cards').toBe(before)
    }
    const other = await app().request(get(path, token, { 'if-none-match': '"other"' }))
    expect(other.status).toBe(200)
  })

  test('never lets an app cache a failure', async () => {
    const response = await app({ failing: true }).request(
      get(`/v1/apps/word-cards?ids=${miru}`, await accessToken())
    )
    expect(response.headers.get('cache-control')).toBeNull()
    expect(response.headers.get('etag')).toBeNull()
    expect(await errorCode(response)).toEqual([500, 'internal'])
  })

  test('answers a route it doesn’t have in the same error shape', async () => {
    const response = await app().request(get('/v1/apps/word-lists', await accessToken()))
    expect(await errorCode(response)).toEqual([404, 'not_found'])
  })

  test.each([
    ['no ids', ''],
    ['an id that is not a Language Reference ID', 'ids=miru'],
    [
      'too many ids',
      `ids=${Array(maximumCardsPerRequest + 1)
        .fill(miru)
        .join(',')}`
    ]
  ])('refuses %s', async (_, query) => {
    const response = await app().request(get(`/v1/apps/word-cards?${query}`, await accessToken()))
    expect(await errorCode(response)).toEqual([400, 'bad_request'])
  })
})

describe('segmentation for a signed-in app', () => {
  test('answers the text’s tokens, each with its entry or candidates, and the language data', async () => {
    const response = await app().request(
      get(`/v1/apps/segmentation?text=${encodeURIComponent('見る')}`, await accessToken())
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      format: 'zenbu.segmentation.v1',
      text: '見る',
      tokens: segmented,
      languageData: info.languageData
    })
  })

  test.each([
    ['no text', ''],
    ['blank text', '  '],
    ['text that is too long', 'あ'.repeat(maximumSegmentedLength + 1)]
  ])('refuses %s', async (_, text) => {
    const response = await app().request(
      get(`/v1/apps/segmentation?text=${encodeURIComponent(text)}`, await accessToken())
    )
    expect(await errorCode(response)).toEqual([400, 'bad_request'])
  })
})

describe('an app’s access token', () => {
  const paths = [`/v1/apps/word-cards?ids=${miru}`, '/v1/apps/segmentation?text=x']

  test.each(paths)('%s refuses a request with no token, and asks for one', async path => {
    const response = await app().request(get(path))
    expect(response.headers.get('www-authenticate')).toBe('Bearer')
    expect(await errorCode(response)).toEqual([401, 'unauthorized'])
  })

  test.each(paths)('%s refuses the website’s service token', async path => {
    expect(await errorCode(await app().request(get(path, serviceToken)))).toEqual([
      401,
      'unauthorized'
    ])
  })

  test.each([
    ['an expired token', () => accessToken({}, { expires: '-1m' })],
    ['another issuer’s token', () => accessToken({ iss: 'https://elsewhere.test' })],
    ['a token for another audience', () => accessToken({ aud: 'https://elsewhere.test' })],
    ['a token signed by another key', () => accessToken({}, { key: keys.stranger })],
    ['a token with no account', () => accessToken({ sub: '' })]
  ])('refuses %s', async (_, made) => {
    for (const path of paths) {
      expect(await errorCode(await app().request(get(path, await made())))).toEqual([
        401,
        'unauthorized'
      ])
    }
  })

  test('refuses a token without the dictionary scope, and names the scope', async () => {
    const token = await accessToken({ scope: 'lists:read known:read' })
    for (const path of paths) {
      const response = await app().request(get(path, token))
      expect(response.headers.get('www-authenticate')).toBe(
        'Bearer error="insufficient_scope", scope="dictionary:read"'
      )
      expect(await errorCode(response)).toEqual([403, 'insufficient_scope'])
    }
  })

  test.each([
    ['a token that never expires', () => accessToken({}, { expires: null })],
    [
      'an unsigned token',
      async () =>
        new UnsecuredJWT({ sub: 'account-1', azp: 'tomodachi', scope: 'dictionary:read' })
          .setIssuer('https://accounts.test')
          .setAudience('https://accounts.test')
          .setExpirationTime('15m')
          .encode()
    ],
    [
      'a token signed with a shared secret',
      () =>
        new SignJWT({ sub: 'account-1', azp: 'tomodachi', scope: 'dictionary:read' })
          .setProtectedHeader({ alg: 'HS256' })
          .setIssuer('https://accounts.test')
          .setAudience('https://accounts.test')
          .setExpirationTime('15m')
          .sign(new TextEncoder().encode('a shared secret of at least 32 bytes!'))
    ]
  ])('refuses %s', async (_, made) => {
    expect(await errorCode(await app().request(get(paths[0], await made())))).toEqual([
      401,
      'unauthorized'
    ])
  })

  test('takes the scheme in any case', async () => {
    const token = await accessToken()
    const response = await app().request(
      new Request(`http://localhost${paths[0]}`, { headers: { authorization: `bearer ${token}` } })
    )
    expect(response.status).toBe(200)
  })

  test('keeps the keys it has while the account service is down, however long', async () => {
    let down = false
    const service = app({
      keysAnswer: () => (down ? new Response('down', { status: 502 }) : undefined)
    })
    const token = await accessToken({}, { expires: '2h' })
    expect((await service.request(get(paths[0], token))).status).toBe(200)
    down = true
    later(60 * 60_000)
    const before = keys.keyFetches()
    for (let attempt = 0; attempt < 3; attempt++) {
      expect((await service.request(get(paths[0], token))).status).toBe(200)
    }
    expect(keys.keyFetches() - before).toBe(1)
  })

  test('stops trusting a key the account service drops, once its keys are ten minutes old', async () => {
    let dropped = false
    const service = app({ keysAnswer: () => (dropped ? Response.json({ keys: [] }) : undefined) })
    const token = await accessToken()
    expect((await service.request(get(paths[0], token))).status).toBe(200)
    dropped = true
    later(11 * 60_000)
    expect(await errorCode(await service.request(get(paths[0], token)))).toEqual([
      401,
      'unauthorized'
    ])
  })

  test('while the account service is down, tries its keys at most every 30 seconds, and says so once', async () => {
    let down = false
    const service = app({
      keysAnswer: () => (down ? new Response('down', { status: 502 }) : undefined)
    })
    expect((await service.request(get(paths[0], await accessToken()))).status).toBe(200)
    down = true
    later(31_000)
    const unknown = await accessToken({}, { kid: 'next' })
    const [fetched, logged] = [keys.keyFetches(), keyFailuresLogged()]
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(await errorCode(await service.request(get(paths[0], unknown)))).toEqual([
        503,
        'unavailable'
      ])
    }
    expect(keys.keyFetches() - fetched).toBe(1)
    expect(keyFailuresLogged() - logged).toBe(1)
    later(62_000)
    await service.request(get(paths[0], unknown))
    expect(keys.keyFetches() - fetched).toBe(2)
  })

  test('reloads the account service’s keys for a key it doesn’t know at most every 30 seconds', async () => {
    const service = app()
    const unknown = await accessToken({}, { kid: 'next' })
    const before = keys.keyFetches()
    for (let attempt = 0; attempt < 3; attempt++) {
      expect((await service.request(get(paths[0], unknown))).status).toBe(401)
    }
    expect(keys.keyFetches() - before).toBe(1)
  })

  test('answers 503 when the account service’s keys can’t be read', async () => {
    const service = app({ keysAnswer: () => new Response('down', { status: 502 }) })
    expect(await errorCode(await service.request(get(paths[0], await accessToken())))).toEqual([
      503,
      'unavailable'
    ])
  })

  test('answers 503 while the service checks no account tokens', async () => {
    expect(
      await errorCode(await app({ access: false }).request(get(paths[0], await accessToken())))
    ).toEqual([503, 'unavailable'])
  })

  test('is limited per account, and says when to try again', async () => {
    const service = app({ limit: 2 })
    const token = await accessToken()
    expect((await service.request(get(paths[0], token))).status).toBe(200)
    expect((await service.request(get(paths[1], token))).status).toBe(200)
    const limited = await service.request(get(paths[0], token))
    expect(await errorCode(limited)).toEqual([429, 'rate_limited'])
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)
    const another = await accessToken({ sub: 'account-2' })
    expect((await service.request(get(paths[0], another))).status).toBe(200)
  })

  test('is never the website’s way in: its routes still want the service token', async () => {
    const response = await app().request(get('/v1/info', await accessToken()))
    expect(response.status).toBe(401)
  })
})

describe('the app routes on the API host', () => {
  test('are under no path nginx sends to the account service', () => {
    const accountPaths = ['/v1/auth', '/v1/me', '/v1/sync', '/v1/health']
    const appRoutes = app()
      .routes.map(route => route.path)
      .filter(path => path.startsWith('/v1/apps'))
    expect(appRoutes.length).toBeGreaterThan(1)
    expect(
      appRoutes.filter(path =>
        accountPaths.some(prefix => path === prefix || path.startsWith(`${prefix}/`))
      )
    ).toEqual([])
  })
})

describe('perMinute', () => {
  test('counts each key’s requests in the current minute, and forgets them in the next', () => {
    let now = 60_000 * 10 + 15_000
    const limit = perMinute(1, () => now)
    expect(limit('a')).toBeNull()
    expect(limit('a')).toBe(45)
    expect(limit('b')).toBeNull()
    now += 45_000
    expect(limit('a')).toBeNull()
  })
})
