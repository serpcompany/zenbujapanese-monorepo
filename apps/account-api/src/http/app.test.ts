import { servedByAccountService, servedByEachServiceItself } from '@zenbu/node-service/api-host'
import { HTTPException } from 'hono/http-exception'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { scopes } from '../domain/clients'
import { standIns } from '../test/app'
import { type AppOptions, createApp } from './app'

const app = (databaseReady: () => Promise<boolean>, options: Partial<AppOptions> = {}) =>
  createApp({ ...standIns, databaseReady, ...options })
const up = () => Promise.resolve(true)
const down = () => Promise.resolve(false)

afterEach(() => vi.restoreAllMocks())

describe('the account service', () => {
  test('answers /v1/health with its status alone', async () => {
    const response = await app(up).request('/v1/health')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })

  test('answers 503 to both health checks while the database is unreachable', async () => {
    const health = await app(down).request('/v1/health')
    expect(health.status).toBe(503)
    expect(await health.json()).toEqual({ status: 'unavailable' })
    const deployer = await app(down).request('/healthz')
    expect(deployer.status).toBe(503)
    expect(await deployer.json()).toEqual({ status: 'unavailable', release: 'abc123def456' })
  })

  test('names its release on /healthz, for the deployer', async () => {
    expect(await (await app(up).request('/healthz')).json()).toEqual({
      status: 'ok',
      release: 'abc123def456'
    })
  })

  test('answers an unknown route with a JSON error', async () => {
    const response = await app(up).request('/v1/nothing')
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: { code: 'not_found', message: 'There is nothing here.' }
    })
  })

  test('answers an HTTP error with its own status, in the JSON error format', async () => {
    const service = app(up)
    service.post('/v1/too-large', () => {
      throw new HTTPException(413, { message: 'The request is too large.' })
    })
    const response = await service.request('/v1/too-large', { method: 'POST' })
    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({
      error: { code: 'too_large', message: 'The request is too large.' }
    })
  })

  test('logs what went wrong inside it, and hides it from the caller', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const response = await app(() =>
      Promise.reject(new Error('connect ECONNREFUSED 10.0.0.5:5432 for user zenbu'))
    ).request('/v1/health')
    expect(response.status).toBe(500)
    const body = await response.text()
    expect(JSON.parse(body)).toEqual({
      error: { code: 'internal', message: 'Something went wrong. Try again later.' }
    })
    expect(body).not.toMatch(/ECONNREFUSED|5432|zenbu|stack/)
    expect(JSON.parse(String(stderr.mock.calls[0][0]))).toMatchObject({
      message: 'request failed',
      route: '/v1/health',
      error: 'connect ECONNREFUSED 10.0.0.5:5432 for user zenbu'
    })
  })

  test("hides a database error in sync from the caller, and says nothing of the learner's data", async () => {
    vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const service = app(up, {
      verifyAccessToken: async () => ({
        userId: 'user-1',
        clientId: 'zenbu-ios',
        scopes: new Set(scopes),
        signedInAt: new Date()
      }),
      accounts: {
        profile: async () => null,
        updateProfile: async () => null,
        sync: () =>
          Promise.reject(new Error('duplicate key value violates "users_pkey" (id)=(user-1)'))
      }
    })
    const response = await service.request('/v1/sync', {
      method: 'POST',
      headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
      body: '{}'
    })
    expect(response.status).toBe(500)
    expect(await response.text()).not.toMatch(/duplicate|users_pkey|user-1/)
  })

  test('limits each account to 120 syncs and 60 profile requests a minute, alone', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-06T12:00:00.000Z'))
    const service = app(up, {
      verifyAccessToken: async token => ({
        userId: token,
        clientId: 'zenbu-ios',
        scopes: new Set(scopes),
        signedInAt: new Date()
      })
    })
    const send = (path: string, account: string) =>
      service.request(path, {
        method: path === '/v1/sync' ? 'POST' : 'GET',
        headers: { authorization: `Bearer ${account}`, 'content-type': 'application/json' },
        body: path === '/v1/sync' ? '{}' : undefined
      })
    for (const [path, perMinute] of [
      ['/v1/sync', 120],
      ['/v1/me', 60]
    ] as const) {
      for (let request = 0; request < perMinute; request++) {
        expect((await send(path, 'busy')).status).not.toBe(429)
      }
      const limited = await send(path, 'busy')
      expect(limited.status, path).toBe(429)
      expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)
      expect(await limited.json()).toMatchObject({ error: { code: 'too_many_requests' } })
      expect((await send(path, 'quiet')).status).not.toBe(429)
    }
    vi.setSystemTime(new Date('2026-10-06T12:01:00.000Z'))
    expect((await send('/v1/sync', 'busy')).status).not.toBe(429)
    vi.useRealTimers()
  })

  test("gives Better Auth's own 429 the Retry-After every other 429 carries", async () => {
    const limited = await app(up, {
      auth: {
        handler: async () =>
          Response.json(
            { message: 'Too many requests. Please try again later.' },
            { status: 429, headers: { 'X-Retry-After': '42' } }
          )
      }
    }).request('/v1/auth/sign-in/nonce', { method: 'POST', body: '{}' })
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('42')
    expect(limited.headers.get('x-retry-after')).toBe('42')
    expect(await limited.json()).toMatchObject({ error: { code: 'too_many_requests' } })
  })

  test('refuses a body over 64 KB to sign-in, as to the other routes', async () => {
    const response = await app(up).request('/v1/auth/sign-in/email-otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@example.com', otp: '123456', name: 'x'.repeat(70 * 1024) })
    })
    expect(response.status).toBe(413)
    expect(await response.json()).toMatchObject({ error: { code: 'too_large' } })
  })

  test('answers cross-origin requests only from the trusted origins, by name, never with *', async () => {
    const trusted = 'https://zenbujapanese.com'
    const service = app(up, { allowedOrigins: [trusted] })
    for (const path of ['/v1/me', '/v1/sync', '/v1/auth/get-session', '/v1/health']) {
      const preflight = (origin: string) =>
        service.request(path, {
          method: 'OPTIONS',
          headers: {
            origin,
            'access-control-request-method': 'POST',
            'access-control-request-headers': 'authorization, content-type'
          }
        })
      const allowed = await preflight(trusted)
      expect(allowed.headers.get('access-control-allow-origin'), path).toBe(trusted)
      expect(allowed.headers.get('access-control-allow-credentials')).toBe('true')
      const refused = await preflight('https://evil.example')
      expect(refused.headers.get('access-control-allow-origin'), path).toBeNull()
    }
    const plain = await service.request('/v1/health', {
      headers: { origin: 'https://evil.example' }
    })
    expect(plain.headers.get('access-control-allow-origin')).toBeNull()
  })

  test("lets the website read how long to wait after a 429, from the service's limits and Better Auth's", async () => {
    const trusted = 'https://zenbujapanese.com'
    const answer = await app(up, { allowedOrigins: [trusted] }).request('/v1/health', {
      headers: { origin: trusted }
    })
    expect(answer.headers.get('access-control-expose-headers')?.split(',').sort()).toEqual([
      'retry-after',
      'x-retry-after'
    ])
  })

  test("puts the sign-in errors Better Auth answers in the service's JSON error format", async () => {
    const response = await app(up).request('/v1/auth/sign-in/email-otp', { method: 'POST' })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: { code: 'invalid_otp', message: 'Invalid OTP' }
    })
  })

  test('shows the dev mailbox only on a local run, and only to a local request', async () => {
    const devMailbox = {
      messages: () => [{ to: 'a@example.com', subject: 'code', text: '123456', at: 'now' }]
    }
    const local = await app(up, { devMailbox }).request('http://localhost:8789/dev/mail')
    expect(local.status).toBe(200)
    expect(await local.json()).toEqual({ messages: devMailbox.messages() })
    const remote = await app(up, { devMailbox }).request('https://api.zenbujapanese.com/dev/mail')
    expect(remote.status).toBe(404)
    const deployed = await app(up).request('http://localhost:8789/dev/mail')
    expect(deployed.status).toBe(404)
  })

  test('answers only paths nginx sends it on the API host, besides its own /healthz and /dev/mail', () => {
    const paths = app(up)
      .routes.map(route => route.path)
      .filter(path => path !== '/*')
    expect(paths.length).toBeGreaterThan(3)
    expect(
      paths.filter(path => !servedByAccountService(path) && !servedByEachServiceItself(path))
    ).toEqual([])
  })
})
