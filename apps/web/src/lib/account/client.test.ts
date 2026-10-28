import { describe, expect, test, vi } from 'vitest'
import { accountApi } from './client'

const apiUrl = 'https://api.example.com'

const profile = {
  id: 'u1',
  name: 'Kana Fan',
  username: 'kana_fan',
  email: 'kana@example.com',
  version: 3,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z'
}

function answering(body: unknown, init: ResponseInit = {}) {
  const send = vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(typeof body === 'string' ? body : JSON.stringify(body), init)
  )
  return { api: accountApi(apiUrl, 'en', send as unknown as typeof fetch), send }
}

const sent = (send: ReturnType<typeof answering>['send']) => {
  const [url, init] = send.mock.calls[0] ?? []
  return {
    url: String(url),
    method: init?.method,
    credentials: init?.credentials,
    headers: init?.headers as Record<string, string>,
    body: init?.body === undefined ? undefined : JSON.parse(String(init.body))
  }
}

describe("the website's account service client", () => {
  test('signs in with a code from the browser, naming the website, with its cookie', async () => {
    const { api, send } = answering({ token: 'bare', user: { id: 'u1', email: 'a@b.c' } })
    expect(await api.signInWithCode('kana@example.com', '123456')).toEqual({
      ok: true,
      value: 'u1'
    })
    expect(sent(send)).toEqual({
      url: `${apiUrl}/v1/auth/sign-in/email-otp`,
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-language': 'en',
        'content-type': 'application/json',
        'x-zenbu-client': 'zenbu-web'
      },
      body: { email: 'kana@example.com', otp: '123456' }
    })
  })

  test('asks for a sign-in code', async () => {
    const { api, send } = answering({ success: true })
    expect(await api.sendCode('kana@example.com')).toEqual({ ok: true, value: true })
    expect(sent(send)).toMatchObject({
      url: `${apiUrl}/v1/auth/email-otp/send-verification-otp`,
      body: { email: 'kana@example.com', type: 'sign-in' }
    })
  })

  test("sends Apple's token, the nonce it was given, and the first sign-in's name", async () => {
    const { api, send } = answering({ token: 'bare', user: { id: 'u2' } })
    await api.signInWithApple({ idToken: 'apple.jwt', nonce: 'n1', name: { firstName: 'Kana' } })
    expect(sent(send).body).toEqual({
      provider: 'apple',
      idToken: { token: 'apple.jwt', nonce: 'n1', user: { name: { firstName: 'Kana' } } }
    })
  })

  test("starts Google's sign-in with where to come back, and takes only an https page to go to", async () => {
    const back = { callbackURL: 'https://site/account/', errorCallbackURL: 'https://site/login/' }
    const google = answering({ url: 'https://accounts.google.com/o/oauth2', redirect: true })
    expect(await google.api.startGoogle(back)).toEqual({
      ok: true,
      value: 'https://accounts.google.com/o/oauth2'
    })
    expect(sent(google.send).body).toEqual({ provider: 'google', ...back })
    const elsewhere = answering({ url: 'javascript:alert(1)', redirect: true })
    expect(await elsewhere.api.startGoogle(back)).toEqual({
      ok: false,
      failure: { kind: 'unexpected', status: 200 }
    })
  })

  test('sends the access token, never the cookie, to /v1/me', async () => {
    const { api, send } = answering(profile)
    expect(await api.profile('access.jwt')).toEqual({
      ok: true,
      value: {
        id: 'u1',
        name: 'Kana Fan',
        username: 'kana_fan',
        email: 'kana@example.com',
        version: 3,
        createdAt: profile.createdAt
      }
    })
    expect(sent(send)).toMatchObject({
      url: `${apiUrl}/v1/me`,
      method: 'GET',
      credentials: 'omit',
      headers: { 'content-language': 'en', authorization: 'Bearer access.jwt' }
    })
  })

  test('names the page’s language on every request, so the service writes its emails in it', async () => {
    const send = vi.fn(async () => new Response(JSON.stringify({ success: true })))
    await accountApi(apiUrl, 'ja', send as unknown as typeof fetch).sendCode('kana@example.com')
    const [, init] = (send.mock.calls[0] ?? []) as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>)['content-language']).toBe('ja')
  })

  test('hands back the profile as it is now when a change conflicts', async () => {
    const { api, send } = answering(
      { error: { code: 'version_conflict', message: 'changed' }, current: profile },
      { status: 409 }
    )
    const changed = await api.changeProfile('access.jwt', { baseVersion: 2, name: 'New' })
    expect(sent(send)).toMatchObject({ method: 'PATCH', body: { baseVersion: 2, name: 'New' } })
    expect(changed).toMatchObject({
      ok: false,
      failure: { kind: 'refused', status: 409, code: 'version_conflict', current: { version: 3 } }
    })
  })

  test("deletes with the learner's confirmation, and Apple's code with its return URL", async () => {
    const { api, send } = answering({ status: 'deleted', appStoreSubscriptionContinues: true })
    const apple = { appleAuthorizationCode: 'c1', appleRedirectUri: 'https://site/account/' }
    expect(await api.deleteAccount('access.jwt', apple)).toEqual({
      ok: true,
      value: { appStoreSubscriptionContinues: true }
    })
    expect(sent(send)).toMatchObject({ method: 'DELETE', body: { confirm: true, ...apple } })
    const plain = answering({ status: 'deleted' })
    expect(await plain.api.deleteAccount('access.jwt', null)).toEqual({
      ok: true,
      value: { appStoreSubscriptionContinues: false }
    })
    expect(sent(plain.send).body).toEqual({ confirm: true })
  })

  test('reads the subscription and the plans, and opens Checkout and the portal, with an access token', async () => {
    const read = answering({
      status: 'active',
      managedIn: 'website',
      expiresAt: '2026-11-19T00:00:00.000Z',
      willRenew: true,
      running: [
        { status: 'active', managedIn: 'website', expiresAt: null, willRenew: true },
        { status: 'frozen', managedIn: 'website' },
        { status: 'active', managedIn: 'somewhere' }
      ],
      canSubscribe: false,
      offers: { appStore: ['com.zenbujapanese.sync.monthly'], website: ['price_monthly'] }
    })
    expect(await read.api.subscription('access.jwt')).toEqual({
      ok: true,
      value: {
        latest: {
          status: 'active',
          managedIn: 'website',
          expiresAt: '2026-11-19T00:00:00.000Z',
          willRenew: true
        },
        running: [{ status: 'active', managedIn: 'website', expiresAt: null, willRenew: true }],
        canSubscribe: false,
        cloudAccess: 'free',
        websitePrices: ['price_monthly'],
        appStoreProducts: ['com.zenbujapanese.sync.monthly']
      }
    })
    expect(sent(read.send)).toMatchObject({ method: 'GET', credentials: 'omit' })
    const plan = {
      price: 'p',
      name: 'Zenbu Sync',
      amount: 499,
      currency: 'usd',
      interval: 'month',
      intervalCount: 1
    }
    expect(await answering({ plans: [plan], trialDays: 7 }).api.plans('access.jwt')).toEqual({
      ok: true,
      value: { plans: [plan], trialDays: 7 }
    })
    expect(
      await answering({ plans: [{ ...plan, interval: 'fortnight' }] }).api.plans('access.jwt')
    ).toMatchObject({ ok: false, failure: { kind: 'unexpected' } })
    const checkout = answering({ url: 'https://checkout.stripe.com/c/pay/cs_1' })
    const pages = {
      price: 'p',
      successUrl: 'https://site/account/?subscribed=1',
      cancelUrl: 'https://site/account/'
    }
    expect(await checkout.api.checkout('access.jwt', pages)).toEqual({
      ok: true,
      value: 'https://checkout.stripe.com/c/pay/cs_1'
    })
    expect(sent(checkout.send)).toMatchObject({ method: 'POST', body: pages })
    const portal = answering({ url: 'https://billing.stripe.com/p/session/1' })
    expect(await portal.api.portal('access.jwt', 'https://site/account/')).toEqual({
      ok: true,
      value: 'https://billing.stripe.com/p/session/1'
    })
    expect(sent(portal.send).body).toEqual({ returnUrl: 'https://site/account/' })
  })

  test("reads how long to wait from Retry-After, or Better Auth's X-Retry-After", async () => {
    for (const header of ['retry-after', 'x-retry-after']) {
      const { api } = answering(
        { error: { code: 'too_many_requests', message: 'slow down' } },
        { status: 429, headers: { [header]: '42' } }
      )
      expect(await api.sendCode('a@b.c'), header).toMatchObject({
        ok: false,
        failure: { kind: 'refused', status: 429, code: 'too_many_requests', retryAfter: 42 }
      })
    }
  })

  test('tells a network failure from a refusal, and an answer of another shape from both', async () => {
    const offline = accountApi(apiUrl, 'en', (async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch)
    expect(await offline.accessToken()).toEqual({ ok: false, failure: { kind: 'offline' } })
    expect(await answering('<html>', { status: 200 }).api.accessToken()).toEqual({
      ok: false,
      failure: { kind: 'unexpected', status: 200 }
    })
    expect(await answering({ token: 42 }).api.accessToken()).toEqual({
      ok: false,
      failure: { kind: 'unexpected', status: 200 }
    })
    expect(await answering('', { status: 502 }).api.accessToken()).toEqual({
      ok: false,
      failure: {
        kind: 'refused',
        status: 502,
        retryAfter: null,
        code: 'status_502',
        message: '',
        current: null
      }
    })
  })

  test('reads the session, the ways in, and no session as signed out', async () => {
    const session = answering({
      user: { id: 'u1', email: 'kana@example.com' },
      session: { token: 'bare', createdAt: '2026-10-07T10:00:00.000Z' }
    })
    expect(await session.api.session()).toEqual({
      ok: true,
      value: {
        userId: 'u1',
        email: 'kana@example.com',
        token: 'bare',
        signedInAt: Date.parse('2026-10-07T10:00:00.000Z')
      }
    })
    expect(sent(session.send).credentials).toBe('include')
    expect(await answering(null).api.session()).toEqual({ ok: true, value: null })
    const ways = answering([
      { id: 'i1', providerId: 'email', accountId: 'kana@example.com' },
      { id: 'i2', providerId: 'apple', accountId: '001.apple' }
    ])
    expect(await ways.api.identities()).toEqual({
      ok: true,
      value: [
        { id: 'i1', provider: 'email', subject: 'kana@example.com' },
        { id: 'i2', provider: 'apple', subject: '001.apple' }
      ]
    })
    expect(
      await answering([{ id: 'i3', providerId: 'github', accountId: 'x' }]).api.identities()
    ).toMatchObject({ ok: false })
  })

  test("asks a sync with no changes for the account's search key, and takes only 64 hex digits", async () => {
    const searchKey = 'ab'.repeat(32)
    const asked = answering({ results: [], changes: [], cursor: 'c', hasMore: false, searchKey })
    expect(await asked.api.searchKey('access.jwt')).toEqual({ ok: true, value: searchKey })
    expect(sent(asked.send)).toMatchObject({
      url: `${apiUrl}/v1/sync`,
      method: 'POST',
      body: { limit: 1 }
    })
    expect(sent(asked.send).headers.authorization).toBe('Bearer access.jwt')
    for (const wrong of [undefined, 'AB'.repeat(32), 'ab'.repeat(31)]) {
      const answer = { results: [], changes: [], cursor: 'c', hasMore: false, searchKey: wrong }
      expect(await answering(answer).api.searchKey('access.jwt')).toMatchObject({ ok: false })
    }
  })
})
