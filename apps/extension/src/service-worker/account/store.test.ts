import { describe, expect, it, vi } from 'vitest'
import {
  json,
  signedInAnswer,
  signedInWorld,
  subscription,
  user
} from '../../test/account-stand-in'
import { accessTokenKey } from './token-keys'

const other = { id: 'user-2', email: 'other@example.com' }

const signInToOther = {
  account: 'sign-in',
  with: { way: 'code', email: other.email, code: '123456' }
} as const

const subscribed = { ...subscription, status: 'active', active: true, cloudAccess: 'subscribed' }

type Asked = { headers: Headers }

const bearerOf = (asked: Asked) => asked.headers.get('authorization')?.slice(7) ?? ''

const aWhile = () => new Promise(resolve => setTimeout(resolve, 20))

function worldOfTwo(onSubscription: () => void = () => {}) {
  return signedInWorld({
    'GET /v1/auth/token': asked => json(200, { token: `access-for-${bearerOf(asked)}` }),
    'GET /v1/me/subscription': asked => {
      onSubscription()
      return json(200, bearerOf(asked) === 'access-for-session-earlier' ? subscribed : subscription)
    },
    'POST /v1/auth/sign-in/email-otp': () => signedInAnswer('session-other', other)
  })
}

const otherAccount = { user: other, subscription, wentToSubscribe: false }

describe('accountStore, when a sign-in to another account lands in the middle of a write', () => {
  it("keeps the earlier account's subscription from landing on the new account", async () => {
    const holds: { reached: Promise<void>; release: () => void }[] = []
    const world = await worldOfTwo(() => {
      if (holds.length === 0) holds.push(world.local.holdNext('get'))
    })
    const reading = world.account.readSubscription()
    await vi.waitFor(() => expect(holds).toHaveLength(1))
    const held = holds[0]
    await held?.reached
    const signingIn = world.account.answer(signInToOther)
    await vi.waitFor(() => expect(world.routes()).toContain('POST /v1/auth/sign-in/email-otp'))
    await aWhile()
    held?.release()
    await reading
    await expect(signingIn).resolves.toEqual({
      type: 'account',
      account: { signedIn: true, email: other.email, subscription }
    })
    expect(await world.store.keptAccount()).toEqual(otherAccount)
  })

  it("keeps the earlier account's Subscribe… from landing on the new account", async () => {
    const world = await worldOfTwo()
    const held = world.local.holdNext('get')
    const going = world.account.answer({ account: 'went-to-subscribe' })
    await held.reached
    const signingIn = world.account.answer(signInToOther)
    await vi.waitFor(() => expect(world.routes()).toContain('POST /v1/auth/sign-in/email-otp'))
    await aWhile()
    held.release()
    await going
    await signingIn
    expect(await world.store.keptAccount()).toEqual(otherAccount)
  })

  it("never answers the earlier session's access token for the new session", async () => {
    const world = await worldOfTwo()
    await world.tokens.withAccess('session-earlier', { method: 'GET', path: '/v1/me/subscription' })
    expect(Object.values(world.session.items.get(accessTokenKey) as object)).not.toContain(
      'session-earlier'
    )
    const held = world.session.holdNext('remove')
    const signingIn = world.account.answer(signInToOther)
    await held.reached
    const reading = world.account.readSubscription()
    await vi.waitFor(() => expect(world.routes().length).toBeGreaterThan(3))
    held.release()
    await reading
    await signingIn
    const afterSignIn = world.asked.slice(3)
    expect(afterSignIn.map(bearerOf)).not.toContain('access-for-session-earlier')
    expect(world.session.items.get(accessTokenKey)).toMatchObject({
      token: 'access-for-session-other'
    })
    expect(await world.store.keptAccount()).toEqual(otherAccount)
  })

  it('answers a kept access token only for the session it was asked with', async () => {
    const world = await worldOfTwo()
    await world.tokens.withAccess('session-earlier', { method: 'GET', path: '/v1/me/subscription' })
    await expect(world.store.accessToken('session-earlier')).resolves.toMatchObject({
      token: 'access-for-session-earlier'
    })
    await expect(world.store.accessToken('session-other')).resolves.toBeNull()
    expect(await world.store.keptAccount()).toMatchObject({ user })
  })
})
