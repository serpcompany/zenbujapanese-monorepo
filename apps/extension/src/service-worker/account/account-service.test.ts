import { describe, expect, it } from 'vitest'
import {
  accountWorld,
  json,
  refusal,
  returnedFrom,
  signedInAnswer,
  signedInWorld,
  subscription,
  user
} from '../../test/account-stand-in'
import { sessionTokenKey } from './token-keys'

const code = { way: 'code', email: user.email, code: '123456' } as const

const token = () => json(200, { token: 'access-1' })

describe('accountService', () => {
  it('keeps the session after a sign-in and reads the subscription, so the account shows the email and the plan', async () => {
    const world = accountWorld({
      'POST /v1/auth/sign-in/email-otp': () => signedInAnswer('session-1'),
      'GET /v1/auth/token': token,
      'GET /v1/me/subscription': () => json(200, subscription)
    })
    const answer = await world.account.answer({ account: 'sign-in', with: code })
    expect(answer).toEqual({
      type: 'account',
      account: { signedIn: true, email: user.email, subscription }
    })
    expect(world.local.items.get(sessionTokenKey)).toBe('session-1')
    expect(world.asked[0]?.body).toEqual({ email: user.email, otp: '123456' })
    expect(world.asked[1]?.headers.get('authorization')).toBe('Bearer session-1')
  })

  it('ends the session on the service when the learner signs out, and forgets it here', async () => {
    const world = await signedInWorld({
      'POST /v1/auth/sign-out': () => json(200, { success: true })
    })
    const answer = await world.account.answer({ account: 'sign-out' })
    expect(answer).toEqual({ type: 'account', account: { signedIn: false } })
    expect(world.asked[0]?.headers.get('authorization')).toBe('Bearer session-earlier')
    expect(world.local.items.size).toBe(0)
  })

  it('signs out here even when the service cannot be reached', async () => {
    const world = await signedInWorld({
      'POST /v1/auth/sign-out': () => new Response('down', { status: 503 })
    })
    await expect(world.account.answer({ account: 'sign-out' })).resolves.toEqual({
      type: 'account',
      account: { signedIn: false }
    })
  })

  it('reads the subscription again when the learner comes back from subscribing, and only then', async () => {
    let plan = subscription
    const world = await signedInWorld({
      'GET /v1/auth/token': token,
      'GET /v1/me/subscription': () => json(200, plan)
    })
    await world.account.answer({ account: 'opened' })
    expect(world.routes()).toEqual(['GET /v1/auth/token'])
    await world.account.answer({ account: 'went-to-subscribe' })
    plan = {
      ...subscription,
      status: 'active',
      active: true,
      managedIn: 'website',
      cloudAccess: 'subscribed'
    }
    const answer = await world.account.answer({ account: 'opened' })
    expect(answer).toMatchObject({
      account: { subscription: { active: true, cloudAccess: 'subscribed' } }
    })
    await world.account.answer({ account: 'opened' })
    expect(world.routes()).toEqual(['GET /v1/auth/token', 'GET /v1/me/subscription'])
  })

  it('keeps reading the subscription each time the account opens after Subscribe…, until the service answers', async () => {
    let reads = 0
    const subscribed = {
      ...subscription,
      status: 'active',
      active: true,
      cloudAccess: 'subscribed'
    }
    const world = await signedInWorld({
      'GET /v1/auth/token': token,
      'GET /v1/me/subscription': () =>
        ++reads === 1 ? new Response('down', { status: 503 }) : json(200, subscribed)
    })
    await world.account.answer({ account: 'went-to-subscribe' })
    await world.account.answer({ account: 'opened' })
    expect(await world.store.keptAccount()).toMatchObject({ wentToSubscribe: true })
    const answer = await world.account.answer({ account: 'opened' })
    expect(answer).toMatchObject({ account: { subscription: { cloudAccess: 'subscribed' } } })
    expect(await world.store.keptAccount()).toMatchObject({ wentToSubscribe: false })
    await world.account.answer({ account: 'opened' })
    expect(reads).toBe(2)
  })

  it('asks for an access token once when the account opens without one, and shows Not signed in when the service has ended the session', async () => {
    const world = await signedInWorld({ 'GET /v1/auth/token': () => refusal(401, 'unauthorized') })
    await expect(world.account.answer({ account: 'opened' })).resolves.toEqual({
      type: 'account',
      account: { signedIn: false }
    })
    expect(world.routes()).toEqual(['GET /v1/auth/token'])
    expect(world.local.items.size).toBe(0)
  })

  it('keeps showing the account when the access token cannot be asked for when it opens', async () => {
    const world = await signedInWorld({
      'GET /v1/auth/token': () => new Response('down', { status: 503 })
    })
    await expect(world.account.answer({ account: 'opened' })).resolves.toMatchObject({
      account: { signedIn: true, email: user.email }
    })
    expect(world.routes()).toEqual(['GET /v1/auth/token'])
  })

  it('deletes the account after a fresh sign-in to the same account, and forgets it here', async () => {
    const world = await signedInWorld({
      'POST /v1/auth/sign-in/email-otp': () => signedInAnswer('session-fresh'),
      'POST /v1/auth/sign-out': () => json(200, { success: true }),
      'GET /v1/auth/token': token,
      'DELETE /v1/me': () => json(200, { status: 'deleted', appStoreSubscriptionContinues: true })
    })
    const answer = await world.account.answer({ account: 'delete', with: code })
    expect(answer).toEqual({ type: 'deleted', appStoreSubscriptionContinues: true })
    const signOut = world.asked.find(asked => asked.route === 'POST /v1/auth/sign-out')
    expect(signOut?.headers.get('authorization')).toBe('Bearer session-earlier')
    const tokenAsk = world.asked.find(asked => asked.route === 'GET /v1/auth/token')
    expect(tokenAsk?.headers.get('authorization')).toBe('Bearer session-fresh')
    expect(world.asked.at(-1)?.body).toEqual({ confirm: true })
    expect(await world.store.keptAccount()).toBeNull()
  })

  it('refuses to delete after a sign-in to another account, ending that session and keeping this one', async () => {
    const world = await signedInWorld({
      'POST /v1/auth/sign-in/email-otp': () =>
        signedInAnswer('session-other', { id: 'user-2', email: 'other@example.com' }),
      'POST /v1/auth/sign-out': () => json(200, { success: true })
    })
    const answer = await world.account.answer({ account: 'delete', with: code })
    expect(answer).toMatchObject({ type: 'refused', refusal: 'other-account' })
    expect(world.asked.at(-1)?.headers.get('authorization')).toBe('Bearer session-other')
    expect(world.routes()).not.toContain('DELETE /v1/me')
    expect(world.local.items.get(sessionTokenKey)).toBe('session-earlier')
  })

  it("signs in with Apple again when the account needs Apple to delete it, and deletes with that fresh session and Apple's code", async () => {
    let deletes = 0
    const world = await signedInWorld(
      {
        'POST /v1/auth/sign-in/email-otp': () => signedInAnswer('session-fresh'),
        'POST /v1/auth/sign-out': () => json(200, {}),
        'POST /v1/auth/sign-in/nonce': () => json(200, { nonce: 'nonce-2' }),
        'POST /v1/auth/sign-in/social': () => signedInAnswer('session-apple'),
        'GET /v1/auth/token': asked =>
          json(200, { token: `access-for-${asked.headers.get('authorization')?.slice(7)}` }),
        'DELETE /v1/me': () =>
          ++deletes === 1
            ? refusal(400, 'apple_authorization_needed')
            : json(200, { status: 'deleted', appStoreSubscriptionContinues: false })
      },
      url => returnedFrom(url, { id_token: 'apple-id', code: 'apple-code' })
    )
    await expect(world.account.answer({ account: 'delete', with: code })).resolves.toEqual({
      type: 'apple-needed'
    })
    const answer = await world.account.answer({ account: 'delete', with: { way: 'apple' } })
    expect(answer).toEqual({ type: 'deleted', appStoreSubscriptionContinues: false })
    const afterApple = world.routes().slice(world.routes().indexOf('POST /v1/auth/sign-in/social'))
    expect(afterApple).toEqual([
      'POST /v1/auth/sign-in/social',
      'POST /v1/auth/sign-out',
      'GET /v1/auth/token',
      'DELETE /v1/me'
    ])
    const last = world.asked.slice(-3)
    expect(last.map(asked => asked.headers.get('authorization'))).toEqual([
      'Bearer session-fresh',
      'Bearer session-apple',
      'Bearer access-for-session-apple'
    ])
    expect(world.asked.at(-1)?.body).toEqual({
      confirm: true,
      appleAuthorizationCode: 'apple-code'
    })
    expect(await world.store.keptAccount()).toBeNull()
  })

  it("asks to continue with Apple again, and sends no delete, when Apple's sign-in gives no code", async () => {
    const world = await signedInWorld(
      {
        'POST /v1/auth/sign-in/nonce': () => json(200, { nonce: 'nonce-2' }),
        'POST /v1/auth/sign-in/social': () => signedInAnswer('session-apple'),
        'POST /v1/auth/sign-out': () => json(200, {})
      },
      url => returnedFrom(url, { id_token: 'apple-id' })
    )
    const answer = await world.account.answer({ account: 'delete', with: { way: 'apple' } })
    expect(answer).toMatchObject({ type: 'refused', refusal: 'apple-again' })
    expect(world.routes()).toEqual([
      'POST /v1/auth/sign-in/nonce',
      'POST /v1/auth/sign-in/social',
      'POST /v1/auth/sign-out'
    ])
    expect(world.asked.at(-1)?.headers.get('authorization')).toBe('Bearer session-apple')
    expect(world.local.items.get(sessionTokenKey)).toBe('session-earlier')
  })

  it("keeps the account's subscription through the fresh sign-in of a delete that doesn't finish", async () => {
    const world = await signedInWorld({
      'POST /v1/auth/sign-in/email-otp': () => signedInAnswer('session-fresh'),
      'POST /v1/auth/sign-out': () => json(200, {}),
      'GET /v1/auth/token': token,
      'DELETE /v1/me': () => refusal(400, 'apple_authorization_needed')
    })
    const kept = { ...subscription, cloudAccess: 'subscribed' as const }
    await world.store.keepSubscription('session-earlier', kept)
    await world.account.answer({ account: 'delete', with: code })
    expect(world.local.items.get(sessionTokenKey)).toBe('session-fresh')
    expect(await world.store.keptAccount()).toMatchObject({ user, subscription: kept })
  })

  it('never takes a lost answer to a delete for done: it asks to try again, forgets nothing, and asks nothing more', async () => {
    const world = await signedInWorld({
      'POST /v1/auth/sign-in/email-otp': () => signedInAnswer('session-fresh'),
      'POST /v1/auth/sign-out': () => json(200, {}),
      'GET /v1/auth/token': token,
      'DELETE /v1/me': () => new Response('gateway', { status: 504 })
    })
    await expect(world.account.answer({ account: 'delete', with: code })).resolves.toMatchObject({
      type: 'refused',
      refusal: 'try-again'
    })
    expect(world.routes().at(-1)).toBe('DELETE /v1/me')
    expect(world.local.items.get(sessionTokenKey)).toBe('session-fresh')
    expect(await world.store.keptAccount()).toMatchObject({ user })
  })

  it('asks to sign in again, and never says deleted, when a delete is refused for a session the service has ended', async () => {
    let tokens = 0
    const world = await signedInWorld({
      'POST /v1/auth/sign-in/email-otp': () => signedInAnswer('session-fresh'),
      'POST /v1/auth/sign-out': () => json(200, {}),
      'GET /v1/auth/token': () => (++tokens === 1 ? token() : refusal(401, 'unauthorized')),
      'DELETE /v1/me': () => refusal(401, 'unauthorized')
    })
    await expect(world.account.answer({ account: 'delete', with: code })).resolves.toMatchObject({
      type: 'refused',
      refusal: 'sign-in-again'
    })
    expect(world.routes().slice(-2)).toEqual(['DELETE /v1/me', 'GET /v1/auth/token'])
  })

  it('keeps the account and asks to try again when a delete gets no answer but the session still works', async () => {
    const world = await signedInWorld({
      'POST /v1/auth/sign-in/email-otp': () => signedInAnswer('session-fresh'),
      'POST /v1/auth/sign-out': () => json(200, {}),
      'GET /v1/auth/token': token,
      'DELETE /v1/me': () => new Response('gateway', { status: 504 })
    })
    await expect(world.account.answer({ account: 'delete', with: code })).resolves.toMatchObject({
      refusal: 'try-again'
    })
    expect(await world.store.keptAccount()).toMatchObject({ user })
  })
})
