import { describe, expect, test } from 'vitest'
import { googleClientIds } from '../test/service'
import { sessionToken, userIdOf, useSignInService } from '../test/sign-in'

const running = useSignInService({ providers: true })

async function withGoogle(subject: string, email: string) {
  const nonce = await running.as.nonce()
  const token = await running.as.idToken(running.google, googleClientIds[0], subject, email, nonce)
  return { nonce, token, signedIn: await running.as.withIdToken('google', token, nonce) }
}

describe('one email, two ways to sign in', () => {
  test('Google with an email-code account is refused until the signed-in learner links it, who is then told', async () => {
    const byCode = await running.as.withCode('both@example.com')
    const id = userIdOf(byCode)
    const refused = await withGoogle('google-both', 'both@example.com')
    expect(refused.signedIn).toMatchObject({
      status: 401,
      body: { error: { code: 'oauth_link_error' } }
    })
    expect(await running.as.users('both@example.com')).toBe(1)

    const nonce = await running.as.nonce()
    const token = await running.as.idToken(
      running.google,
      googleClientIds[0],
      'google-both',
      'both@example.com',
      nonce
    )
    const before = running.service.mailbox.messages().length
    expect((await running.as.link(sessionToken(byCode), 'google', token, nonce)).status).toBe(200)
    expect(await running.as.identitiesOf(id)).toEqual([
      { provider: 'email', subject: 'both@example.com' },
      { provider: 'google', subject: 'google-both' }
    ])
    const notice = await running.as.lastMessageTo('both@example.com', before)
    expect(notice.text).toContain(
      'Sign in with Google can now sign in to your Zenbu Japanese account'
    )
  })

  test('an email code into an account Google made is refused, and leaves no session, until that learner adds email', async () => {
    const { signedIn } = await withGoogle('google-only', 'gonly@example.com')
    const id = userIdOf(signedIn)
    const intruder = await running.as.withCode('gonly@example.com')
    expect(intruder).toMatchObject({ status: 403, body: { error: { code: 'account_not_linked' } } })
    expect(await running.as.identitiesOf(id)).toEqual([
      { provider: 'google', subject: 'google-only' }
    ])
    const leftover = sessionToken(intruder)
    if (leftover !== '') {
      expect((await running.service.call('/v1/auth/token', { token: leftover })).status).toBe(401)
    }

    const owner = await running.as.withCode('gonly@example.com', {
      session: sessionToken(signedIn)
    })
    expect(owner.status).toBe(200)
    expect(userIdOf(owner)).toBe(id)
    expect(await running.as.identitiesOf(id)).toEqual([
      { provider: 'email', subject: 'gonly@example.com' },
      { provider: 'google', subject: 'google-only' }
    ])
  })

  test('linking needs a sign-in from the last ten minutes, so a stolen old session can add no way in', async () => {
    const byCode = await running.as.withCode('stale@example.com')
    const session = sessionToken(byCode)
    await running.as.ageSession(session, 30)
    const nonce = await running.as.nonce()
    const token = await running.as.idToken(
      running.google,
      googleClientIds[0],
      'attacker',
      'attacker@example.com',
      nonce
    )
    const refused = await running.as.link(session, 'google', token, nonce)
    expect(refused).toMatchObject({ status: 403, body: { error: { code: 'session_not_fresh' } } })
    expect(await running.as.identitiesOf(userIdOf(byCode))).toEqual([
      { provider: 'email', subject: 'stale@example.com' }
    ])
  })

  test('a Google account already in another account is refused', async () => {
    await withGoogle('google-taken', 'taken@example.com')
    const other = await running.as.withCode('other-owner@example.com')
    const nonce = await running.as.nonce()
    const token = await running.as.idToken(
      running.google,
      googleClientIds[0],
      'google-taken',
      'taken@example.com',
      nonce
    )
    const refused = await running.as.link(sessionToken(other), 'google', token, nonce)
    expect(refused.status).toBeGreaterThanOrEqual(400)
    expect(await running.as.identitiesOf(userIdOf(other))).toEqual([
      { provider: 'email', subject: 'other-owner@example.com' }
    ])
  })

  test('removing a way to sign in needs a fresh sign-in, and never removes the last one', async () => {
    const byCode = await running.as.withCode('unlink@example.com')
    const session = sessionToken(byCode)
    const unlink = () =>
      running.service.call('/v1/auth/unlink-account', {
        token: session,
        body: { providerId: 'email' }
      })
    const last = await unlink()
    expect(last.status).toBeGreaterThanOrEqual(400)
    expect(await running.as.identitiesOf(userIdOf(byCode))).toEqual([
      { provider: 'email', subject: 'unlink@example.com' }
    ])
    await running.as.ageSession(session, 30)
    expect(await unlink()).toMatchObject({
      status: 403,
      body: { error: { code: 'session_not_fresh' } }
    })
  })
})
