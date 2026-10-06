import { describe, expect, test } from 'vitest'
import { startService } from '../test/service'
import { sessionToken, userIdOf, useSignInService } from '../test/sign-in'

const running = useSignInService()

describe('signing in with an email code', () => {
  test('makes a new learner, verifies their email, and records the email as an identity', async () => {
    const signedIn = await running.as.withCode('new@example.com')
    expect(signedIn.status).toBe(200)
    expect(sessionToken(signedIn)).not.toBe('')
    expect((signedIn.body?.user as { emailVerified: boolean }).emailVerified).toBe(true)
    expect(await running.as.identitiesOf(userIdOf(signedIn))).toEqual([
      { provider: 'email', subject: 'new@example.com' }
    ])
  })

  test('signs an existing learner in to the same account', async () => {
    const first = await running.as.withCode('again@example.com')
    const second = await running.as.withCode('again@example.com')
    expect(userIdOf(second)).toBe(userIdOf(first))
    expect(await running.as.users('again@example.com')).toBe(1)
  })

  test('refuses a code used before', async () => {
    const otp = await running.as.emailCode('replay@example.com')
    const body = { email: 'replay@example.com', otp }
    expect((await running.service.call('/v1/auth/sign-in/email-otp', { body })).status).toBe(200)
    const replayed = await running.service.call('/v1/auth/sign-in/email-otp', { body })
    expect(replayed).toMatchObject({ status: 400, body: { error: { code: 'invalid_otp' } } })
  })

  test('stops taking guesses after five wrong codes', async () => {
    const otp = await running.as.emailCode('guess@example.com')
    const wrong = otp === '000000' ? '111111' : '000000'
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await running.service.call('/v1/auth/sign-in/email-otp', {
        body: { email: 'guess@example.com', otp: wrong }
      })
    }
    const right = await running.service.call('/v1/auth/sign-in/email-otp', {
      body: { email: 'guess@example.com', otp }
    })
    expect(right.status).not.toBe(200)
  })

  test('keeps codes only encrypted, never as the digits', async () => {
    const otp = await running.as.emailCode('stored@example.com')
    const stored = await running.service.rows(
      "select value from verifications where identifier like '%stored@example.com%'"
    )
    expect(stored).toHaveLength(1)
    expect(JSON.stringify(stored)).not.toContain(otp)
  })

  test('sends one client address at most five codes in ten minutes, whatever the emails', async () => {
    const asks = []
    for (let ask = 0; ask < 6; ask += 1) {
      asks.push(
        await running.service.call('/v1/auth/email-otp/send-verification-otp', {
          body: { email: `flood-${ask}@example.com`, type: 'sign-in' },
          from: '192.0.2.7'
        })
      )
    }
    expect(asks.slice(0, 5).map(ask => ask.status)).toEqual([200, 200, 200, 200, 200])
    expect(asks[5]).toMatchObject({ status: 429, body: { error: { code: expect.any(String) } } })
  })

  test('answers a known and an unknown email the same way, so neither reveals an account', async () => {
    await running.as.withCode('known@example.com')
    const ask = (email: string) =>
      running.service.call('/v1/auth/email-otp/send-verification-otp', {
        body: { email, type: 'sign-in' }
      })
    const known = await ask('known@example.com')
    const unknown = await ask('nobody-yet@example.com')
    expect({ status: unknown.status, body: unknown.body }).toEqual({
      status: known.status,
      body: known.body
    })
  })

  test('sends a code only to sign in: the other kinds of code are refused', async () => {
    for (const type of ['email-verification', 'forget-password', 'change-email']) {
      const refused = await running.service.call('/v1/auth/email-otp/send-verification-otp', {
        body: { email: 'known@example.com', type }
      })
      expect(refused, type).toMatchObject({
        status: 400,
        body: { error: { code: 'sign_in_only' } }
      })
    }
  })
})

describe('without an email sender', () => {
  test('says email sign-in is unavailable, rather than sending nothing', async () => {
    const offline = await startService({ emailSender: false })
    const refused = await offline.call('/v1/auth/email-otp/send-verification-otp', {
      body: { email: 'anyone@example.com', type: 'sign-in' }
    })
    await offline.close()
    expect(refused).toMatchObject({ status: 503, body: { error: { code: 'email_unavailable' } } })
  })
})
