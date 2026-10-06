import { decodeJwt, generateKeyPair, SignJWT } from 'jose'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { useAccountService } from '../test/accounts'
import { publicUrl } from '../test/service'

const accounts = useAccountService()

afterEach(() => vi.useRealTimers())

describe('GET /v1/me', () => {
  test("answers the signed-in learner's own profile, from a new account's first sign-in", async () => {
    const learner = await accounts.learner('me@example.com')
    const me = await accounts.me(learner.token)
    expect(me.status).toBe(200)
    expect(me.body).toEqual({
      id: learner.userId,
      name: expect.any(String),
      username: null,
      email: 'me@example.com',
      version: 1,
      createdAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
      updatedAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/)
    })
  })

  test('takes only a valid access token, and answers every refusal alike', async () => {
    const learner = await accounts.learner('refusals@example.com')
    const { privateKey } = await generateKeyPair('EdDSA')
    const ownSigned = await new SignJWT({ sub: learner.userId })
      .setProtectedHeader({ alg: 'EdDSA', kid: 'not-ours' })
      .setIssuer(publicUrl)
      .setAudience(publicUrl)
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(privateKey)
    const [header, , signature] = learner.token.split('.')
    const claims = { ...decodeJwt(learner.token), sub: 'someone-else' }
    const forged = `${header}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${signature}`
    for (const token of [learner.session, ownSigned, forged, 'not.a.token', 'garbage']) {
      const refused = await accounts.me(token)
      expect(refused, token).toMatchObject({
        status: 401,
        body: { error: { code: 'unauthorized', message: expect.any(String) } }
      })
      expect(refused.headers.get('www-authenticate')).toBe('Bearer')
    }
    const response = await accounts.running.service.app.request(`${publicUrl}/v1/me`, {
      headers: { 'x-user-id': learner.userId, 'x-debug-user': learner.userId }
    })
    expect(response.status).toBe(401)
  })

  test('refuses an access token once it expires, 15 minutes after it was issued', async () => {
    const learner = await accounts.learner('expiry@example.com')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 14 * 60 * 1000)
    expect((await accounts.me(learner.token)).status).toBe(200)
    vi.setSystemTime(Date.now() + 2 * 60 * 1000)
    expect((await accounts.me(learner.token)).status).toBe(401)
  })

  test('holds a name given at sign-up to the profile rules, and ignores fields sign-up has no say in', async () => {
    const signUp = async (email: string, extra: Record<string, unknown>) => {
      const otp = await accounts.running.as.emailCode(email)
      const signedIn = await accounts.running.service.call('/v1/auth/sign-in/email-otp', {
        body: { email, otp, ...extra }
      })
      expect(signedIn.status).toBe(200)
      const token = await accounts.running.service.call('/v1/auth/token', {
        token: signedIn.headers.get('set-auth-token') ?? ''
      })
      const profile = (await accounts.me(String(token.body?.token))).body
      const [stored] = await accounts.running.service.rows(
        `select image from users where email = '${email}'`
      )
      return { ...profile, image: stored?.image }
    }
    expect(
      await signUp('named@example.com', {
        name: '  Kana \t Fan ',
        image: 'https://example.com/kana.png'
      })
    ).toMatchObject({ name: 'Kana Fan', image: 'https://example.com/kana.png' })
    expect(
      await signUp('unnamed@example.com', {
        name: ` ${'x'.repeat(5000)}\u202e`,
        username: 'hijack',
        version: 99,
        image: `https://example.com/${'x'.repeat(60_000)}\u0000`
      })
    ).toMatchObject({ name: '', username: null, version: 1, image: null })
  })

  test('keeps the profile as it is when the learner signs in again', async () => {
    const first = await accounts.learner('again@example.com')
    const before = (await accounts.me(first.token)).body
    const again = await accounts.learner('again@example.com')
    expect(again.userId).toBe(first.userId)
    expect((await accounts.me(again.token)).body).toEqual(before)
  })

  test("refuses a token for an account that's gone", async () => {
    const learner = await accounts.learner('gone@example.com')
    await accounts.running.service.rows(`delete from users where id = '${learner.userId}'`)
    expect((await accounts.me(learner.token)).status).toBe(401)
  })
})

describe('PATCH /v1/me', () => {
  test('changes the name and username, normalized, and moves the version and updatedAt on', async () => {
    const learner = await accounts.learner('patch@example.com')
    const before = (await accounts.me(learner.token)).body as Record<string, string>
    const changed = await accounts.changeMe(learner.token, {
      baseVersion: 1,
      name: '  Kana   Fan ',
      username: 'Kana_Fan'
    })
    expect(changed.status).toBe(200)
    expect(changed.body).toMatchObject({ name: 'Kana Fan', username: 'kana_fan', version: 2 })
    expect(changed.body?.createdAt).toBe(before.createdAt)
    expect(Date.parse(String(changed.body?.updatedAt))).toBeGreaterThan(
      Date.parse(before.updatedAt)
    )
    expect((await accounts.me(learner.token)).body).toEqual(changed.body)

    const cleared = await accounts.changeMe(learner.token, { baseVersion: 2, username: null })
    expect(cleared.body).toMatchObject({ name: 'Kana Fan', username: null, version: 3 })
  })

  test('changes nothing, and keeps the version, when the values are the same', async () => {
    const learner = await accounts.learner('same@example.com')
    await accounts.changeMe(learner.token, { baseVersion: 1, name: 'Same' })
    const again = await accounts.changeMe(learner.token, { baseVersion: 2, name: ' Same ' })
    expect(again).toMatchObject({ status: 200, body: { name: 'Same', version: 2 } })
  })

  test('refuses a stale version with the profile as it is now, and changes nothing', async () => {
    const learner = await accounts.learner('stale@example.com')
    await accounts.changeMe(learner.token, { baseVersion: 1, name: 'From the phone' })
    const stale = await accounts.changeMe(learner.token, { baseVersion: 1, name: 'From the Mac' })
    expect(stale).toMatchObject({
      status: 409,
      body: {
        error: { code: 'version_conflict' },
        current: { id: learner.userId, name: 'From the phone', version: 2 }
      }
    })
    expect((await accounts.me(learner.token)).body).toMatchObject({ name: 'From the phone' })
  })

  test('lets one of several changes sent together from one version through, and conflicts the rest', async () => {
    const learner = await accounts.learner('race@example.com')
    const answers = await Promise.all(
      ['First', 'Second', 'Third'].map(name =>
        accounts.changeMe(learner.token, { baseVersion: 1, name })
      )
    )
    const statuses = answers.map(answer => answer.status).sort()
    expect(statuses).toEqual([200, 409, 409])
    const winner = answers.find(answer => answer.status === 200)?.body?.name
    expect((await accounts.me(learner.token)).body).toMatchObject({ name: winner, version: 2 })
  })

  test('keeps usernames unique whatever their case, and says so without naming who has it', async () => {
    const first = await accounts.learner('taken-1@example.com')
    const second = await accounts.learner('taken-2@example.com')
    expect(
      (await accounts.changeMe(first.token, { baseVersion: 1, username: 'taken' })).status
    ).toBe(200)
    const taken = await accounts.changeMe(second.token, { baseVersion: 1, username: 'TAKEN' })
    expect(taken).toEqual(
      expect.objectContaining({
        status: 409,
        body: {
          error: { code: 'username_taken', message: 'That username is taken. Choose another.' }
        }
      })
    )
    expect((await accounts.me(second.token)).body).toMatchObject({ username: null, version: 1 })
  })

  test('refuses what it cannot take, saying which field and why', async () => {
    const learner = await accounts.learner('invalid@example.com')
    const refusals = [
      [{ name: 'No version' }, 'bad_request'],
      [{ baseVersion: 1 }, 'invalid_fields'],
      [{ baseVersion: 1, email: 'new@example.com' }, 'bad_request'],
      [{ baseVersion: 1, username: 'no spaces allowed' }, 'invalid_fields'],
      [{ baseVersion: 1, name: '' }, 'invalid_fields'],
      [{ baseVersion: 0, name: 'Zero' }, 'bad_request'],
      [{ baseVersion: '1', name: 'Text' }, 'bad_request']
    ] as const
    for (const [body, code] of refusals) {
      const refused = await accounts.changeMe(learner.token, body)
      expect(refused, JSON.stringify(body)).toMatchObject({
        status: 400,
        body: { error: { code } }
      })
    }
    expect((await accounts.me(learner.token)).body).toMatchObject({ version: 1 })
  })
})
