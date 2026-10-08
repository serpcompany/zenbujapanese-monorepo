import { decodeJwt } from 'jose'
import { describe, expect, test } from 'vitest'
import { websiteOrigin } from '../test/service'
import {
  fromTheWebsite,
  websiteCookie as sessionCookie,
  setCookie,
  useSignInService,
  websiteSession
} from '../test/sign-in'

const running = useSignInService({ providers: true })

const sixtyDays = 60 * 24 * 60 * 60

describe('the website', () => {
  test('signs in to a session the browser keeps in an HttpOnly cookie, and reads it from there', async () => {
    const { service, as } = running
    const signedIn = await service.call('/v1/auth/sign-in/email-otp', {
      ...fromTheWebsite(),
      body: { email: 'website@example.com', otp: await as.emailCode('website@example.com') }
    })
    expect(signedIn.status).toBe(200)
    const cookie = setCookie(signedIn.headers, sessionCookie)
    expect(cookie?.attributes).toEqual(
      expect.arrayContaining([`max-age=${sixtyDays}`, 'path=/', 'httponly', 'samesite=lax'])
    )
    const session = cookie?.value ?? ''

    const issued = await service.call('/v1/auth/token', fromTheWebsite(session))
    expect(issued.status).toBe(200)
    expect(decodeJwt(String(issued.body?.token))).toMatchObject({ azp: 'zenbu-web' })
    expect(await service.call('/v1/auth/get-session', fromTheWebsite(session))).toMatchObject({
      status: 200,
      body: { user: { email: 'website@example.com' } }
    })

    const signedOut = await service.call('/v1/auth/sign-out', {
      ...fromTheWebsite(session),
      body: {}
    })
    expect(signedOut.status).toBe(200)
    expect(setCookie(signedOut.headers, sessionCookie)).toMatchObject({
      value: '',
      attributes: expect.arrayContaining(['max-age=0'])
    })
    expect((await service.call('/v1/auth/token', fromTheWebsite(session))).status).toBe(401)
  })

  test("keeps the browser's session when a refused sign-in made a session it then deleted", async () => {
    const { service, as } = running
    const email = 'google-only@example.com'
    const nonce = await as.nonce()
    const token = await as.idToken(
      running.google,
      'web.apps.googleusercontent.com',
      'google-only',
      email,
      nonce
    )
    const signedIn = await service.call('/v1/auth/sign-in/social', {
      ...fromTheWebsite(),
      body: { provider: 'google', idToken: { token, nonce } }
    })
    expect(signedIn.status).toBe(200)
    const session = websiteSession(signedIn)
    await as.ageSession(session, 11)

    const refused = await service.call('/v1/auth/sign-in/email-otp', {
      ...fromTheWebsite(session),
      body: { email, otp: await as.emailCode(email) }
    })
    expect(refused).toMatchObject({ status: 403, body: { error: { code: 'account_not_linked' } } })
    expect(refused.headers.getSetCookie()).toEqual([])
    expect(await service.call('/v1/auth/get-session', fromTheWebsite(session))).toMatchObject({
      status: 200,
      body: { user: { email } }
    })
  })

  test('never hands the page the signed session token, which stays in the cookie', async () => {
    const { service, as } = running
    const signedIn = await service.app.request('/v1/auth/sign-in/email-otp', {
      method: 'POST',
      headers: { origin: websiteOrigin, 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'website-token@example.com',
        otp: await as.emailCode('website-token@example.com')
      })
    })
    expect(signedIn.status).toBe(200)
    expect(signedIn.headers.get('set-auth-token')).toBeNull()
    const exposed = (signedIn.headers.get('access-control-expose-headers') ?? '').split(/,\s*/)
    expect(exposed).not.toContain('set-auth-token')
    expect(exposed).toContain('retry-after')
    expect(signedIn.headers.get('access-control-allow-origin')).toBe(websiteOrigin)
    expect(signedIn.headers.getSetCookie().join()).toContain(sessionCookie)

    const app = await as.withCode('website-app@example.com')
    expect(app.headers.get('set-auth-token')).toMatch(/\./)
  })
})
