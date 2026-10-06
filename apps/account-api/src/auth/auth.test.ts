import { createLocalJWKSet, decodeJwt, jwtVerify } from 'jose'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { claims, type IdentityProvider, standInForProviders } from '../test/identity-provider'
import {
  appBundleIdentifier,
  googleClientIds,
  publicUrl,
  type Service,
  startService
} from '../test/service'

let service: Service
let apple: IdentityProvider
let google: IdentityProvider

beforeAll(async () => {
  ;({ apple, google } = await standInForProviders())
  service = await startService()
})

afterAll(async () => {
  await service.close()
  vi.restoreAllMocks()
})

async function emailCode(email: string): Promise<string> {
  const before = service.mailbox.messages().length
  const sent = await service.call('/v1/auth/email-otp/send-verification-otp', {
    body: { email, type: 'sign-in' }
  })
  expect(sent).toMatchObject({ status: 200, body: { success: true } })
  await vi.waitFor(() => expect(service.mailbox.messages().length).toBe(before + 1))
  const message = service.mailbox.messages()[0]
  expect(message.to).toBe(email)
  const code = /code is (\d{6})/.exec(message.text)?.[1]
  expect(code).toBeDefined()
  return code as string
}

async function signInWithCode(email: string) {
  const code = await emailCode(email)
  return service.call('/v1/auth/sign-in/email-otp', { body: { email, otp: code } })
}

const sessionToken = (signedIn: { headers: Headers }) =>
  signedIn.headers.get('set-auth-token') ?? ''

const signInWithIdToken = (provider: 'apple' | 'google', token: string, nonce?: string) =>
  service.call('/v1/auth/sign-in/social', {
    body: { provider, idToken: { token, ...(nonce ? { nonce } : {}) } }
  })

const identitiesOf = (userId: unknown) =>
  service.rows(
    `select provider, subject from user_identities where user_id = '${String(userId)}' order by provider, subject`
  )

describe('signing in with an email code', () => {
  test('makes a new learner, verifies their email, and records the email as an identity', async () => {
    const signedIn = await signInWithCode('new@example.com')
    expect(signedIn.status).toBe(200)
    expect(sessionToken(signedIn)).not.toBe('')
    const user = signedIn.body?.user as { id: string; emailVerified: boolean }
    expect(user.emailVerified).toBe(true)
    expect(await identitiesOf(user.id)).toEqual([{ provider: 'email', subject: 'new@example.com' }])
  })

  test('signs an existing learner in to the same account', async () => {
    const first = await signInWithCode('again@example.com')
    const second = await signInWithCode('again@example.com')
    expect((second.body?.user as { id: string }).id).toBe((first.body?.user as { id: string }).id)
    expect(
      await service.rows("select count(*)::int as n from users where email = 'again@example.com'")
    ).toEqual([{ n: 1 }])
  })

  test('refuses a code used before, and a wrong code, in the JSON error format', async () => {
    const code = await emailCode('replay@example.com')
    const body = { email: 'replay@example.com', otp: code }
    expect((await service.call('/v1/auth/sign-in/email-otp', { body })).status).toBe(200)
    const replayed = await service.call('/v1/auth/sign-in/email-otp', { body })
    expect(replayed).toMatchObject({ status: 400, body: { error: { code: 'invalid_otp' } } })
  })

  test('stops taking guesses after five wrong codes', async () => {
    const code = await emailCode('guess@example.com')
    const wrong = code === '000000' ? '111111' : '000000'
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await service.call('/v1/auth/sign-in/email-otp', {
        body: { email: 'guess@example.com', otp: wrong }
      })
    }
    const right = await service.call('/v1/auth/sign-in/email-otp', {
      body: { email: 'guess@example.com', otp: code }
    })
    expect(right.status).not.toBe(200)
  })

  test('sends one address at most five codes in ten minutes', async () => {
    const asks = []
    for (let ask = 0; ask < 6; ask += 1) {
      asks.push(
        await service.call('/v1/auth/email-otp/send-verification-otp', {
          body: { email: `flood-${ask}@example.com`, type: 'sign-in' },
          from: '192.0.2.7'
        })
      )
    }
    expect(asks.slice(0, 5).map(ask => ask.status)).toEqual([200, 200, 200, 200, 200])
    expect(asks[5]).toMatchObject({ status: 429, body: { error: { code: expect.any(String) } } })
  })

  test('answers a known and an unknown email the same way, so neither reveals an account', async () => {
    await signInWithCode('known@example.com')
    const known = await service.call('/v1/auth/email-otp/send-verification-otp', {
      body: { email: 'known@example.com', type: 'sign-in' }
    })
    const unknown = await service.call('/v1/auth/email-otp/send-verification-otp', {
      body: { email: 'nobody-yet@example.com', type: 'sign-in' }
    })
    expect(unknown).toEqual({ ...known, headers: unknown.headers })
  })
})

describe('signing in with an Apple or Google ID token', () => {
  test.each<['apple' | 'google', () => IdentityProvider, string]>([
    ['google', () => google, googleClientIds[1]],
    ['apple', () => apple, appBundleIdentifier]
  ])('%s makes a new learner, then signs the same learner in again', async (provider, issuer, audience) => {
    const subject = `${provider}-learner`
    const token = () =>
      issuer().sign(
        claims(issuer(), audience, subject, { email: `${provider}@example.com`, nonce: 'n-1' })
      )
    const first = await signInWithIdToken(provider, await token(), 'n-1')
    expect(first.status).toBe(200)
    const second = await signInWithIdToken(provider, await token(), 'n-1')
    const id = (first.body?.user as { id: string }).id
    expect((second.body?.user as { id: string }).id).toBe(id)
    expect(await identitiesOf(id)).toEqual([{ provider, subject }])
  })

  test.each<[string, () => Promise<string>, string | undefined]>([
    [
      'expired',
      async () =>
        google.sign(
          claims(google, googleClientIds[0], 's-expired', {
            exp: Math.floor(Date.now() / 1000) - 60
          })
        ),
      undefined
    ],
    [
      'older than an hour',
      async () =>
        google.sign(
          claims(google, googleClientIds[0], 's-old', { iat: Math.floor(Date.now() / 1000) - 7200 })
        ),
      undefined
    ],
    [
      'for another app',
      async () => google.sign(claims(google, 'someone-else.apps.googleusercontent.com', 's-aud')),
      undefined
    ],
    [
      'from another issuer',
      async () =>
        google.sign(
          claims({ ...google, issuer: 'https://evil.example' }, googleClientIds[0], 's-iss')
        ),
      undefined
    ],
    [
      'signed with another key',
      async () =>
        google.sign(claims(google, googleClientIds[0], 's-key'), { key: google.otherKey }),
      undefined
    ],
    ['malformed', async () => 'not.a.token', undefined],
    [
      'for another nonce',
      async () => google.sign(claims(google, googleClientIds[0], 's-nonce', { nonce: 'issued' })),
      'presented'
    ]
  ])('refuses a token %s, and makes no learner', async (_, token, nonce) => {
    const before = await service.rows('select count(*)::int as n from users')
    const refused = await signInWithIdToken('google', await token(), nonce)
    expect(refused.status).toBe(401)
    expect(refused.body).toMatchObject({
      error: { code: expect.any(String), message: expect.any(String) }
    })
    expect(await service.rows('select count(*)::int as n from users')).toEqual(before)
  })
})

describe('one email, two methods', () => {
  test('a second method with the same email signs in only after the learner links it', async () => {
    const byCode = await signInWithCode('both@example.com')
    const id = (byCode.body?.user as { id: string }).id
    const googleToken = await google.sign(
      claims(google, googleClientIds[0], 'google-both', { email: 'both@example.com' })
    )
    const refused = await signInWithIdToken('google', googleToken)
    expect(refused).toMatchObject({ status: 401, body: { error: { code: 'oauth_link_error' } } })
    expect(
      await service.rows("select count(*)::int as n from users where email = 'both@example.com'")
    ).toEqual([{ n: 1 }])
    expect(await identitiesOf(id)).toEqual([{ provider: 'email', subject: 'both@example.com' }])

    const linked = await service.call('/v1/auth/link-social', {
      token: sessionToken(byCode),
      body: { provider: 'google', idToken: { token: googleToken } }
    })
    expect(linked.status).toBe(200)
    const signedIn = await signInWithIdToken('google', googleToken)
    expect((signedIn.body?.user as { id: string }).id).toBe(id)
    expect(await identitiesOf(id)).toEqual([
      { provider: 'email', subject: 'both@example.com' },
      { provider: 'google', subject: 'google-both' }
    ])
  })
})

describe('access tokens', () => {
  test('have a published key from the first request, before anyone signs in', async () => {
    const fresh = await startService()
    const jwks = await fresh.call('/v1/auth/jwks')
    await fresh.close()
    expect(jwks.status).toBe(200)
    expect(jwks.body?.keys).toEqual([
      expect.objectContaining({ alg: 'EdDSA', kid: expect.any(String) })
    ])
  })

  test('are short-lived, name only the learner, and verify through the JWKS', async () => {
    const signedIn = await signInWithCode('token@example.com')
    const issued = await service.call('/v1/auth/token', { token: sessionToken(signedIn) })
    expect(issued.status).toBe(200)
    const token = String(issued.body?.token)
    const keys = await service.call('/v1/auth/jwks')
    const jwks = createLocalJWKSet(keys.body as { keys: [] })
    const { payload } = await jwtVerify(token, jwks, { issuer: publicUrl, audience: publicUrl })
    expect(payload.sub).toBe((signedIn.body?.user as { id: string }).id)
    expect(Object.keys(payload).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'sub'])
    expect(Number(payload.exp) - Number(payload.iat)).toBe(15 * 60)

    const later = new Date((Number(payload.exp) + 1) * 1000)
    await expect(jwtVerify(token, jwks, { currentDate: later })).rejects.toThrow()
    const [header, body] = token.split('.')
    const forged = `${header}.${Buffer.from(JSON.stringify({ ...decodeJwt(token), sub: 'someone-else' })).toString('base64url')}.${token.split('.')[2]}`
    expect(body).not.toBe(forged.split('.')[1])
    await expect(jwtVerify(forged, jwks)).rejects.toThrow()
  })

  test("can't be had with a session the learner signed out of", async () => {
    const signedIn = await signInWithCode('signout@example.com')
    const session = sessionToken(signedIn)
    expect((await service.call('/v1/auth/sign-out', { token: session, body: {} })).status).toBe(200)
    const again = await service.call('/v1/auth/token', { token: session })
    expect(again).toMatchObject({ status: 401, body: { error: { code: 'unauthorized' } } })
  })

  test('are refused to a made-up session, and no header lets anyone in without one', async () => {
    const refused = await service.call('/v1/auth/token', { token: 'made-up-session-token' })
    expect(refused.status).toBe(401)
    const response = await service.app.request(`${publicUrl}/v1/auth/token`, {
      headers: { 'x-user-id': 'anyone', 'x-debug-user': 'anyone' }
    })
    expect(response.status).toBe(401)
  })
})
