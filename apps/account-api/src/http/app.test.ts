import { HTTPException } from 'hono/http-exception'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { type AppOptions, createApp } from './app'

const signInRefused = () =>
  Promise.resolve(Response.json({ code: 'INVALID_OTP', message: 'Invalid OTP' }, { status: 400 }))

const app = (databaseReady: () => Promise<boolean>, options: Partial<AppOptions> = {}) =>
  createApp({
    release: 'abc123def456',
    databaseReady,
    auth: { handler: signInRefused },
    emailSignIn: true,
    devMailbox: null,
    ...options
  })
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

  test("puts the sign-in errors Better Auth answers in the service's JSON error format", async () => {
    const response = await app(up).request('/v1/auth/sign-in/email-otp', { method: 'POST' })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: { code: 'invalid_otp', message: 'Invalid OTP' }
    })
  })

  test('says email sign-in is unavailable, rather than sending nothing, while no sender is set', async () => {
    const handler = vi.fn(signInRefused)
    const response = await app(up, { emailSignIn: false, auth: { handler } }).request(
      '/v1/auth/email-otp/send-verification-otp',
      { method: 'POST' }
    )
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ error: { code: 'email_unavailable' } })
    expect(handler).not.toHaveBeenCalled()
  })

  test('shows the dev mailbox only on a local run, and only to a local request', async () => {
    const devMailbox = {
      messages: () => [{ to: 'a@example.com', subject: 'code', text: '123456', at: 'now' }]
    }
    const local = await app(up, { devMailbox }).request('http://localhost:8789/dev/mail')
    expect(local.status).toBe(200)
    expect(await local.json()).toEqual({ messages: devMailbox.messages() })
    const remote = await app(up, { devMailbox }).request(
      'https://account-api.zenbujapanese.com/dev/mail'
    )
    expect(remote.status).toBe(404)
    const deployed = await app(up).request('http://localhost:8789/dev/mail')
    expect(deployed.status).toBe(404)
  })
})
