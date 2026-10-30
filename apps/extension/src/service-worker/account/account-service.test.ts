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
    expect(world.asked).toEqual([])
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

  it("asks Apple again when the account signs in with Apple, and sends Apple's code", async () => {
    let deletes = 0
    const world = await signedInWorld(
      {
        'POST /v1/auth/sign-in/email-otp': () => signedInAnswer('session-fresh'),
        'POST /v1/auth/sign-out': () => json(200, {}),
        'POST /v1/auth/sign-in/nonce': () => json(200, { nonce: 'nonce-2' }),
        'GET /v1/auth/token': token,
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
    const answer = await world.account.answer({ account: 'delete-with-apple' })
    expect(answer).toEqual({ type: 'deleted', appStoreSubscriptionContinues: false })
    expect(world.asked.at(-1)?.body).toEqual({
      confirm: true,
      appleAuthorizationCode: 'apple-code'
    })
  })

  it('takes a lost answer to a delete for done once the service refuses the session', async () => {
    let tokens = 0
    const world = await signedInWorld({
      'POST /v1/auth/sign-in/email-otp': () => signedInAnswer('session-fresh'),
      'POST /v1/auth/sign-out': () => json(200, {}),
      'GET /v1/auth/token': () => (++tokens === 1 ? token() : refusal(401, 'unauthorized')),
      'DELETE /v1/me': () => new Response('gateway', { status: 504 })
    })
    await expect(world.account.answer({ account: 'delete', with: code })).resolves.toEqual({
      type: 'deleted',
      appStoreSubscriptionContinues: false
    })
    expect(await world.store.keptAccount()).toBeNull()
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
