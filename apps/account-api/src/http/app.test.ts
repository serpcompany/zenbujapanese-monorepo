import { afterEach, describe, expect, test, vi } from 'vitest'
import { createApp } from './app'

const app = (databaseReady: () => Promise<boolean>) =>
  createApp({ release: 'abc123def456', databaseReady })
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
    expect((await app(down).request('/v1/health')).status).toBe(503)
    const health = await app(down).request('/healthz')
    expect(health.status).toBe(503)
    expect(await health.json()).toEqual({ status: 'unavailable', release: 'abc123def456' })
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
})
