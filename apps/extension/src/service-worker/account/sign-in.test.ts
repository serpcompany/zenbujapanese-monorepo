import { describe, expect, it } from 'vitest'
import {
  accountWorld,
  extensionId,
  json,
  origin,
  refusal,
  returnedFrom,
  signedInAnswer,
  standInIdentity,
  standInService,
  user
} from '../../test/account-stand-in'
import { accountApi } from './api'
import { signIns } from './sign-in'

const nonce = () => json(200, { nonce: 'nonce-1' })

describe('signIns', () => {
  it('asks for a sign-in code for the email, naming the extension', async () => {
    const world = accountWorld({
      'POST /v1/auth/email-otp/send-verification-otp': () => json(200, { success: true })
    })
    await expect(
      world.account.answer({ account: 'send-code', email: user.email })
    ).resolves.toEqual({ type: 'code-sent' })
    expect(world.asked[0]?.body).toEqual({ email: user.email, type: 'sign-in' })
    expect(world.asked[0]?.headers.get('x-zenbu-client')).toBe('zenbu-extension')
  })

  it('says how long to wait when the service is asked too often', async () => {
    const world = accountWorld({
      'POST /v1/auth/email-otp/send-verification-otp': () =>
        refusal(429, 'rate_limited', { 'retry-after': '30' })
    })
    await expect(
      world.account.answer({ account: 'send-code', email: user.email })
    ).resolves.toEqual({
      type: 'refused',
      refusal: 'wait',
      retryAfter: 30
    })
  })

  it("turns the service's sign-in refusals into the ones the learner can act on", async () => {
    const answers: Record<string, string> = {
      invalid_otp: 'wrong-code',
      otp_expired: 'new-code',
      too_many_attempts: 'new-code',
      oauth_link_error: 'other-way',
      email_unavailable: 'no-email',
      client_mismatch: 'cannot',
      something_new: 'try-again'
    }
    const results = await Promise.all(
      Object.keys(answers).map(code =>
        accountWorld({ 'POST /v1/auth/sign-in/email-otp': () => refusal(400, code) })
          .account.answer({
            account: 'sign-in',
            with: { way: 'code', email: user.email, code: '000000' }
          })
          .then(answer => [code, 'refusal' in answer ? answer.refusal : answer.type])
      )
    )
    expect(Object.fromEntries(results)).toEqual(answers)
  })

  it("signs in with Google's ID token and the service's nonce", async () => {
    const world = accountWorld(
      {
        'POST /v1/auth/sign-in/nonce': nonce,
        'POST /v1/auth/sign-in/social': () => signedInAnswer('session-google'),
        'GET /v1/auth/token': () => json(200, { token: 'access-1' }),
        'GET /v1/me/subscription': () => json(200, {})
      },
      url => returnedFrom(url, { id_token: 'google-id' })
    )
    const answer = await world.account.answer({ account: 'sign-in', with: { way: 'google' } })
    expect(answer).toMatchObject({
      type: 'account',
      account: { signedIn: true, email: user.email }
    })
    const social = world.asked.find(asked => asked.route === 'POST /v1/auth/sign-in/social')
    expect(social?.body).toEqual({
      provider: 'google',
      idToken: { token: 'google-id', nonce: 'nonce-1' }
    })
    expect(social?.headers.get('x-zenbu-client')).toBe('zenbu-extension')
  })

  it("sends Apple's name on a first sign-in with Apple", async () => {
    const name = JSON.stringify({ name: { firstName: 'Aiko', lastName: 'Sato' } })
    const world = accountWorld(
      {
        'POST /v1/auth/sign-in/nonce': nonce,
        'POST /v1/auth/sign-in/social': () => signedInAnswer('session-apple')
      },
      url => returnedFrom(url, { id_token: 'apple-id', code: 'apple-code', user: name })
    )
    await world.account.answer({ account: 'sign-in', with: { way: 'apple' } })
    const social = world.asked.find(asked => asked.route === 'POST /v1/auth/sign-in/social')
    expect(social?.body).toEqual({
      provider: 'apple',
      idToken: {
        token: 'apple-id',
        nonce: 'nonce-1',
        user: { name: { firstName: 'Aiko', lastName: 'Sato' } }
      }
    })
  })

  it('offers no Google sign-in in a build without a Google client, and asks nothing', async () => {
    const service = standInService({})
    const { identity, launched } = standInIdentity()
    const ways = signIns(accountApi(origin, service.send), identity, {
      apiOrigin: origin,
      googleClientId: null,
      appleServicesId: 'com.zenbujapanese.website',
      extensionId
    })
    await expect(ways.signIn({ way: 'google' })).resolves.toMatchObject({
      ok: false,
      refused: { refusal: 'cannot' }
    })
    expect(service.asked).toEqual([])
    expect(launched).toEqual([])
  })

  it('keeps nothing when the service answers a sign-in without its session token', async () => {
    const world = accountWorld({ 'POST /v1/auth/sign-in/email-otp': () => json(200, { user }) })
    const answer = await world.account.answer({
      account: 'sign-in',
      with: { way: 'code', email: user.email, code: '123456' }
    })
    expect(answer).toMatchObject({ refusal: 'try-again' })
    expect(await world.store.keptAccount()).toBeNull()
  })
})
