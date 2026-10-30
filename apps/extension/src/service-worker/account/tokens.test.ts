import { describe, expect, it, vi } from 'vitest'
import {
  json,
  jwtWith,
  refusal,
  signedInAnswer,
  signedInWorld,
  subscription
} from '../../test/account-stand-in'
import { accessTokenKey, sessionTokenKey } from './token-keys'

const now = Date.parse('2026-10-30T09:00:00Z')

describe('accessTokens', () => {
  it('asks for an access token with the session token, keeps it until a minute before it expires, then asks again', async () => {
    const exp = now / 1000 + 120
    const world = await signedInWorld({
      'GET /v1/auth/token': () => json(200, { token: jwtWith(exp) }),
      'GET /v1/me/subscription': () => json(200, {})
    })
    await world.tokens.withAccess('session-earlier', { method: 'GET', path: '/v1/me/subscription' })
    expect(world.asked[0]?.headers.get('authorization')).toBe('Bearer session-earlier')
    expect(world.asked[1]?.headers.get('authorization')).toBe(`Bearer ${jwtWith(exp)}`)
    expect(world.session.items.get(accessTokenKey)).toMatchObject({
      token: jwtWith(exp),
      expiresAt: exp * 1000
    })
    await world.tokens.withAccess('session-earlier', { method: 'GET', path: '/v1/me/subscription' })
    expect(world.routes()).toEqual([
      'GET /v1/auth/token',
      'GET /v1/me/subscription',
      'GET /v1/me/subscription'
    ])
    world.session.items.set(accessTokenKey, {
      ...(world.session.items.get(accessTokenKey) as object),
      token: 'old',
      expiresAt: now + 59_000
    })
    await world.tokens.withAccess('session-earlier', { method: 'GET', path: '/v1/me/subscription' })
    expect(world.routes().at(-2)).toBe('GET /v1/auth/token')
  })

  it.each([
    [401, 'unauthorized'],
    [401, 'sign_in_again']
  ])('signs the learner out when the session token is refused with %i %s', async (status, code) => {
    const world = await signedInWorld({ 'GET /v1/auth/token': () => refusal(status, code) })
    const answer = await world.tokens.withAccess('session-earlier', {
      method: 'GET',
      path: '/v1/me/subscription'
    })
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
    const answer = await world.tokens.withAccess('session-earlier', {
      method: 'GET',
      path: '/v1/me/subscription'
    })
    expect(answer).toMatchObject({ ok: true, value: { status: 'none' } })
    expect(world.routes()).toEqual([
      'GET /v1/auth/token',
      'GET /v1/me/subscription',
      'GET /v1/auth/token',
      'GET /v1/me/subscription'
    ])
    expect(await world.store.keptAccount()).not.toBeNull()
  })

  it('answers signed out, and keeps no token, for a session this browser no longer has', async () => {
    const world = await signedInWorld({
      'GET /v1/auth/token': () => json(200, { token: 'access-1' })
    })
    await world.store.forgetSession('session-earlier')
    await expect(
      world.tokens.withAccess('session-earlier', { method: 'GET', path: '/v1/me/subscription' })
    ).resolves.toMatchObject({ status: 401 })
    expect(world.routes()).toEqual(['GET /v1/auth/token'])
    expect(world.session.items.size).toBe(0)
    await world.account.readSubscription()
    expect(world.routes()).toEqual(['GET /v1/auth/token'])
  })

  describe('an access token that comes back after the session it was asked with ended', () => {
    const other = { id: 'user-2', email: 'other@example.com' }

    async function signedOutWhileAsking() {
      let release = () => {}
      const held = new Promise<void>(resolve => {
        release = resolve
      })
      const subscribed = {
        ...subscription,
        status: 'active',
        active: true,
        cloudAccess: 'subscribed'
      }
      const world = signedInWorld({
        'GET /v1/auth/token': async asked => {
          if (asked.headers.get('authorization') !== 'Bearer session-earlier') {
            return json(200, { token: 'access-other' })
          }
          await held
          return json(200, { token: 'access-earlier' })
        },
        'GET /v1/me/subscription': asked =>
          json(
            200,
            asked.headers.get('authorization') === 'Bearer access-earlier'
              ? subscribed
              : subscription
          ),
        'POST /v1/auth/sign-out': () => json(200, { success: true }),
        'POST /v1/auth/sign-in/email-otp': () => signedInAnswer('session-other', other)
      })
      const made = await world
      const reading = made.account.readSubscription()
      await vi.waitFor(() => expect(made.routes()).toContain('GET /v1/auth/token'))
      await made.account.answer({ account: 'sign-out' })
      return { world: made, release, reading }
    }

    it('is dropped when the learner signed out while it was asked for', async () => {
      const { world, release, reading } = await signedOutWhileAsking()
      release()
      await reading
      expect(world.session.items.size).toBe(0)
      expect(world.local.items.size).toBe(0)
      expect(world.routes()).not.toContain('GET /v1/me/subscription')
    })

    it('is dropped when the learner signed in to another account while it was asked for', async () => {
      const { world, release, reading } = await signedOutWhileAsking()
      await world.account.answer({
        account: 'sign-in',
        with: { way: 'code', email: other.email, code: '123456' }
      })
      release()
      await reading
      await world.account.answer({ account: 'went-to-subscribe' })
      await world.account.answer({ account: 'opened' })
      expect(world.session.items.get(accessTokenKey)).toMatchObject({ token: 'access-other' })
      const reads = world.asked.filter(asked => asked.route === 'GET /v1/me/subscription')
      expect(reads.map(asked => asked.headers.get('authorization'))).toEqual([
        'Bearer access-other',
        'Bearer access-other'
      ])
      await expect(world.account.answer({ account: 'read' })).resolves.toEqual({
        type: 'account',
        account: { signedIn: true, email: other.email, subscription }
      })
    })
  })
})
