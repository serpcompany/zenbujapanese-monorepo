import { describe, expect, it } from 'vitest'
import { json, jwtWith, refusal, signedInWorld } from '../../test/account-stand-in'
import { accessTokenKey, sessionTokenKey } from './token-keys'

const now = Date.parse('2026-10-30T09:00:00Z')

describe('accessTokens', () => {
  it('asks for an access token with the session token, keeps it until a minute before it expires, then asks again', async () => {
    const exp = now / 1000 + 120
    const world = await signedInWorld({
      'GET /v1/auth/token': () => json(200, { token: jwtWith(exp) }),
      'GET /v1/me/subscription': () => json(200, {})
    })
    await world.tokens.withAccess({ method: 'GET', path: '/v1/me/subscription' })
    expect(world.asked[0]?.headers.get('authorization')).toBe('Bearer session-earlier')
    expect(world.asked[1]?.headers.get('authorization')).toBe(`Bearer ${jwtWith(exp)}`)
    expect(world.session.items.get(accessTokenKey)).toEqual({
      token: jwtWith(exp),
      expiresAt: exp * 1000
    })
    await world.tokens.withAccess({ method: 'GET', path: '/v1/me/subscription' })
    expect(world.routes()).toEqual([
      'GET /v1/auth/token',
      'GET /v1/me/subscription',
      'GET /v1/me/subscription'
    ])
    world.session.items.set(accessTokenKey, { token: 'old', expiresAt: now + 59_000 })
    await world.tokens.withAccess({ method: 'GET', path: '/v1/me/subscription' })
    expect(world.routes().at(-2)).toBe('GET /v1/auth/token')
  })

  it.each([
    [401, 'unauthorized'],
    [401, 'sign_in_again']
  ])('signs the learner out when the session token is refused with %i %s', async (status, code) => {
    const world = await signedInWorld({ 'GET /v1/auth/token': () => refusal(status, code) })
    const answer = await world.tokens.withAccess({ method: 'GET', path: '/v1/me/subscription' })
    expect(answer).toMatchObject({ ok: false, status: 401 })
    expect(world.local.items.has(sessionTokenKey)).toBe(false)
    expect(await world.store.keptAccount()).toBeNull()
    expect(world.routes()).toEqual(['GET /v1/auth/token'])
  })

  it('asks for a new access token once after a 401, and calls again with it', async () => {
    let tokens = 0
    const world = await signedInWorld({
      'GET /v1/auth/token': () => json(200, { token: `access-${++tokens}` }),
      'GET /v1/me/subscription': asked =>
        asked.headers.get('authorization') === 'Bearer access-1'
          ? refusal(401, 'unauthorized')
          : json(200, { status: 'none' })
    })
    const answer = await world.tokens.withAccess({ method: 'GET', path: '/v1/me/subscription' })
    expect(answer).toMatchObject({ ok: true, value: { status: 'none' } })
    expect(world.routes()).toEqual([
      'GET /v1/auth/token',
      'GET /v1/me/subscription',
      'GET /v1/auth/token',
      'GET /v1/me/subscription'
    ])
    expect(await world.store.keptAccount()).not.toBeNull()
  })

  it('answers signed out, and asks nothing, without a session token', async () => {
    const world = await signedInWorld({})
    await world.store.forget()
    await expect(world.tokens.newAccessToken()).resolves.toMatchObject({ status: 401 })
    expect(world.asked).toEqual([])
  })
})
