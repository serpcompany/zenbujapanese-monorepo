import { describe, expect, test } from 'vitest'
import { claims, type IdentityProvider } from '../test/identity-provider'
import { appBundleIdentifier, googleClientIds } from '../test/service'
import { sha256, userIdOf, useSignInService } from '../test/sign-in'

const running = useSignInService({ providers: true })

const userCount = async () =>
  (await running.service.rows('select count(*)::int as n from users'))[0]?.n

describe('signing in with an Apple or Google ID token', () => {
  test('Google makes a new learner, then signs the same learner in again', async () => {
    const signInOnce = async () => {
      const nonce = await running.as.nonce()
      return running.as.withIdToken(
        'google',
        await running.as.idToken(
          running.google,
          googleClientIds[1],
          'google-learner',
          'g@example.com',
          nonce
        ),
        nonce
      )
    }
    const first = await signInOnce()
    expect(first.status).toBe(200)
    const second = await signInOnce()
    expect(userIdOf(second)).toBe(userIdOf(first))
    expect(await running.as.identitiesOf(userIdOf(first))).toEqual([
      { provider: 'google', subject: 'google-learner' }
    ])
  })

  test("Apple signs in with its token's nonce hashed, as the app sends it to Apple", async () => {
    const nonce = await running.as.nonce()
    const token = await running.as.idToken(
      running.apple,
      appBundleIdentifier,
      'apple-learner',
      'a@example.com',
      sha256(nonce)
    )
    const signedIn = await running.as.withIdToken('apple', token, nonce)
    expect(signedIn.status).toBe(200)
    expect(await running.as.identitiesOf(userIdOf(signedIn))).toEqual([
      { provider: 'apple', subject: 'apple-learner' }
    ])
  })

  test("makes an account with Apple's private relay email, which is the learner's to keep", async () => {
    const nonce = await running.as.nonce()
    const relay = 'k7q2x9@privaterelay.appleid.com'
    const token = await running.as.idToken(
      running.apple,
      appBundleIdentifier,
      'apple-relay',
      relay,
      sha256(nonce)
    )
    const signedIn = await running.as.withIdToken('apple', token, nonce)
    expect(signedIn.status).toBe(200)
    expect((signedIn.body?.user as { email: string }).email).toBe(relay)
  })

  test('needs a nonce from this running.service, and takes each one once', async () => {
    const token = (nonce: string) =>
      running.as.idToken(running.google, googleClientIds[0], 'google-nonce', 'n@example.com', nonce)
    const without = await running.as.withIdToken('google', await token('anything'))
    expect(without).toMatchObject({ status: 400, body: { error: { code: 'nonce_required' } } })
    const madeUp = await running.as.withIdToken('google', await token('made-up'), 'made-up')
    expect(madeUp).toMatchObject({ status: 401, body: { error: { code: 'invalid_nonce' } } })

    const nonce = await running.as.nonce()
    const captured = await token(nonce)
    expect((await running.as.withIdToken('google', captured, nonce)).status).toBe(200)
    const replayed = await running.as.withIdToken('google', captured, nonce)
    expect(replayed).toMatchObject({ status: 401, body: { error: { code: 'invalid_nonce' } } })
  })

  test.each<[string, (nonce: string) => Promise<string>]>([
    [
      'expired',
      nonce =>
        running.google.sign(
          claims(running.google, googleClientIds[0], 's1', {
            nonce,
            email: 'x1@example.com',
            exp: Math.floor(Date.now() / 1000) - 60
          })
        )
    ],
    [
      'older than an hour',
      nonce =>
        running.google.sign(
          claims(running.google, googleClientIds[0], 's2', {
            nonce,
            email: 'x2@example.com',
            iat: Math.floor(Date.now() / 1000) - 7200
          })
        )
    ],
    [
      'for another app',
      nonce =>
        running.google.sign(
          claims(running.google, 'someone-else.apps.googleusercontent.com', 's3', {
            nonce,
            email: 'x3@example.com'
          })
        )
    ],
    [
      'from another issuer',
      nonce =>
        running.google.sign(
          claims({ ...running.google, issuer: 'https://evil.example' }, googleClientIds[0], 's4', {
            nonce,
            email: 'x4@example.com'
          })
        )
    ],
    [
      'signed with another key',
      nonce =>
        running.google.sign(
          claims(running.google, googleClientIds[0], 's5', { nonce, email: 'x5@example.com' }),
          {
            key: running.google.otherKey
          }
        )
    ],
    ['malformed', async () => 'not.a.token'],
    [
      'made for another nonce',
      () =>
        running.google.sign(
          claims(running.google, googleClientIds[0], 's6', {
            nonce: 'issued-elsewhere',
            email: 'x6@example.com'
          })
        )
    ]
  ])('refuses a token %s, and makes no learner', async (_, token) => {
    const before = await userCount()
    const nonce = await running.as.nonce()
    const refused = await running.as.withIdToken('google', await token(nonce), nonce)
    expect(refused.status).toBe(401)
    expect(refused.body).toMatchObject({
      error: { code: expect.any(String), message: expect.any(String) }
    })
    expect(await userCount()).toBe(before)
  })

  test.each<[string, () => IdentityProvider, string, unknown]>([
    ['Google', () => running.google, googleClientIds[0], false],
    ['Apple', () => running.apple, appBundleIdentifier, 'false']
  ])("refuses %s's unverified email, and makes no learner", async (_, issuer, audience, verified) => {
    const before = await userCount()
    const nonce = await running.as.nonce()
    const provider = issuer() === running.apple ? 'apple' : 'google'
    const tokenNonce = provider === 'apple' ? sha256(nonce) : nonce
    const token = await issuer().sign(
      claims(issuer(), audience, `unverified-${provider}`, {
        nonce: tokenNonce,
        email: `unverified-${provider}@example.com`,
        email_verified: verified as boolean
      })
    )
    const refused = await running.as.withIdToken(provider, token, nonce)
    expect(refused.status).toBeGreaterThanOrEqual(400)
    expect(await userCount()).toBe(before)
  })

  test("refuses a provider that isn't set up", async () => {
    const refused = await running.service.call('/v1/auth/sign-in/social', {
      body: { provider: 'github', idToken: { token: 'x', nonce: await running.as.nonce() } }
    })
    expect(refused.status).toBeGreaterThanOrEqual(400)
    expect(refused.body).toMatchObject({ error: { code: expect.any(String) } })
  })
})
