import { Hono } from 'hono'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { AccountEnv } from './env'
import { perAccountLimit, perClientLimit } from './rate-limit'

afterEach(() => vi.useRealTimers())

function limited(middleware: ReturnType<typeof perAccountLimit>) {
  const app = new Hono<AccountEnv>()
  app.use('*', async (context, next) => {
    context.set('userId', context.req.header('x-user') ?? '')
    context.set('clientId', context.req.header('x-app') ?? '')
    context.set('scopes', new Set())
    await next()
  })
  app.use('*', middleware)
  app.get('/', context => context.text('ok'))
  return async (user: string, client: string) =>
    (await app.request('/', { headers: { 'x-user': user, 'x-app': client } })).status
}

describe('rate limits', () => {
  test('count an account in each app apart', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-07T09:00:00.000Z'))
    const send = limited(perAccountLimit(2))
    expect([
      await send('a', 'zenbu-ios'),
      await send('a', 'zenbu-ios'),
      await send('a', 'zenbu-ios')
    ]).toEqual([200, 200, 429])
    expect(await send('a', 'tomodachi')).toBe(200)
    expect(await send('b', 'zenbu-ios')).toBe(200)
  })

  test('count every account of an app together, each app at its own limit', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-07T09:00:00.000Z'))
    const send = limited(perClientLimit(id => (id === 'tomodachi' ? 2 : 5)))
    expect([
      await send('a', 'tomodachi'),
      await send('b', 'tomodachi'),
      await send('c', 'tomodachi')
    ]).toEqual([200, 200, 429])
    expect(await send('d', 'zenbu-ios')).toBe(200)
    vi.setSystemTime(new Date('2026-10-07T09:01:00.000Z'))
    expect(await send('c', 'tomodachi')).toBe(200)
  })
})
