import { describe, expect, it } from 'vitest'
import { json, origin, refusal, standInService } from '../../test/account-stand-in'
import { accountApi } from './api'

describe('accountApi', () => {
  it('names the extension on a sign-in, sends no cookies and no Authorization, and keeps the session token', async () => {
    const service = standInService({
      'POST /v1/auth/sign-in/email-otp': () =>
        json(200, { user: { id: 'u' } }, { 'set-auth-token': 'session-1' })
    })
    const answer = await accountApi(
      origin,
      service.send
    )({
      method: 'POST',
      path: '/v1/auth/sign-in/email-otp',
      signIn: true,
      body: { email: 'learner@example.com', otp: '123456' }
    })
    expect(answer).toEqual({
      ok: true,
      status: 200,
      value: { user: { id: 'u' } },
      sessionToken: 'session-1'
    })
    const [asked] = service.asked
    expect(asked?.headers.get('x-zenbu-client')).toBe('zenbu-extension')
    expect(asked?.headers.get('authorization')).toBeNull()
    expect(asked?.headers.get('content-type')).toBe('application/json')
    expect(asked?.init).toMatchObject({ credentials: 'omit', cache: 'no-store', redirect: 'error' })
  })

  it('sends a bearer token on a call that carries one, without naming the extension', async () => {
    const service = standInService({ 'GET /v1/me/subscription': () => json(200, {}) })
    await accountApi(
      origin,
      service.send
    )({ method: 'GET', path: '/v1/me/subscription', bearer: 'access-1' })
    const [asked] = service.asked
    expect(asked?.headers.get('authorization')).toBe('Bearer access-1')
    expect(asked?.headers.get('x-zenbu-client')).toBeNull()
    expect(asked?.headers.get('content-type')).toBeNull()
  })

  it("reads a refusal's code, and how long to wait from Retry-After or X-Retry-After", async () => {
    const service = standInService({
      'POST /a': () => refusal(429, 'rate_limited', { 'retry-after': '42' }),
      'POST /b': () => refusal(429, 'rate_limited', { 'x-retry-after': '7' }),
      'POST /c': () => refusal(400, 'invalid_otp', { 'retry-after': '9' }),
      'POST /d': () => json(500, {})
    })
    const api = accountApi(origin, service.send)
    await expect(api({ method: 'POST', path: '/a' })).resolves.toMatchObject({
      code: 'rate_limited',
      retryAfter: 42
    })
    await expect(api({ method: 'POST', path: '/b' })).resolves.toMatchObject({ retryAfter: 7 })
    await expect(api({ method: 'POST', path: '/c' })).resolves.toMatchObject({
      code: 'invalid_otp',
      retryAfter: null
    })
    await expect(api({ method: 'POST', path: '/d' })).resolves.toMatchObject({ code: 'status_500' })
  })

  it('takes an answer that is not JSON, or no answer, for a network failure', async () => {
    const html = accountApi(origin, async () => new Response('<html>', { status: 502 }))
    const thrown = accountApi(origin, () => Promise.reject(new TypeError('Failed to fetch')))
    const expected = { ok: false, status: 0, code: 'network', retryAfter: null }
    await expect(html({ method: 'GET', path: '/v1/auth/token' })).resolves.toEqual(expected)
    await expect(thrown({ method: 'GET', path: '/v1/auth/token' })).resolves.toEqual(expected)
  })
})
