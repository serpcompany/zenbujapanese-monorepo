import { createLocalJWKSet, decodeJwt, jwtVerify } from 'jose'
import { describe, expect, test } from 'vitest'
import { publicUrl, startService } from '../test/service'
import { sessionToken, userIdOf, useSignInService } from '../test/sign-in'

const running = useSignInService()

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

  test('are short-lived, name only the learner, the app, and its scopes, and verify through the JWKS', async () => {
    const signedIn = await running.as.withCode('token@example.com')
    const issued = await running.service.call('/v1/auth/token', { token: sessionToken(signedIn) })
    expect(issued.status).toBe(200)
    const token = String(issued.body?.token)
    const keys = await running.service.call('/v1/auth/jwks')
    const jwks = createLocalJWKSet(keys.body as { keys: [] })
    const { payload } = await jwtVerify(token, jwks, { issuer: publicUrl, audience: publicUrl })
    expect(payload.sub).toBe(userIdOf(signedIn))
    expect(Object.keys(payload).sort()).toEqual([
      'aud',
      'auth_time',
      'azp',
      'exp',
      'iat',
      'iss',
      'scope',
      'sub'
    ])
    expect(payload).toMatchObject({
      azp: 'zenbu-ios',
      scope:
        'account account:delete profile lists:read lists:write known:read known:write watch:read watch:write'
    })
    expect(Number(payload.exp) - Number(payload.iat)).toBe(15 * 60)

    const later = new Date((Number(payload.exp) + 1) * 1000)
    await expect(jwtVerify(token, jwks, { currentDate: later })).rejects.toThrow()
    const [header, , signature] = token.split('.')
    const claims = Buffer.from(JSON.stringify({ ...decodeJwt(token), sub: 'someone-else' }))
    await expect(
      jwtVerify(`${header}.${claims.toString('base64url')}.${signature}`, jwks)
    ).rejects.toThrow()
  })

  test("can't be had with a session the learner signed out of", async () => {
    const session = sessionToken(await running.as.withCode('signout@example.com'))
    const signedOut = await running.service.call('/v1/auth/sign-out', { token: session, body: {} })
    expect(signedOut.status).toBe(200)
    const again = await running.service.call('/v1/auth/token', { token: session })
    expect(again).toMatchObject({ status: 401, body: { error: { code: 'unauthorized' } } })
  })

  test('take only a signed session token: the bare one in the database or the answer is refused', async () => {
    const bare = sessionToken(await running.as.withCode('bare@example.com')).split('.')[0]
    expect(bare).not.toBe('')
    expect((await running.service.call('/v1/auth/token', { token: bare })).status).toBe(401)
  })

  test('are refused to a made-up session, and no header lets anyone in without one', async () => {
    const madeUp = await running.service.call('/v1/auth/token', { token: 'made-up.session' })
    expect(madeUp.status).toBe(401)
    const response = await running.service.app.request(`${publicUrl}/v1/auth/token`, {
      headers: { 'x-user-id': 'anyone', 'x-debug-user': 'anyone' }
    })
    expect(response.status).toBe(401)
  })
})
