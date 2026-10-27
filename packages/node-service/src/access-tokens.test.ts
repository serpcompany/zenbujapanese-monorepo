import { errors } from 'jose'
import { describe, expect, test } from 'vitest'
import { scopesOf, verifiedAccessToken } from './access-tokens'
import { accessTokenSigner, now } from './test/access-token-signer'

const accountUrl = 'https://api.example.test'
const claims = { sub: 'u1', azp: 'zenbu-ios', scope: 'profile  cards:read' }

describe('an access token', () => {
  test('gives the learner, the app, and its scopes, once its signature, issuer, and audience check', async () => {
    const { keySet, sign } = await accessTokenSigner(accountUrl)
    const verified = await verifiedAccessToken(await sign(claims), keySet, accountUrl)
    expect(verified).toMatchObject(claims)
    expect(verified && scopesOf(verified)).toEqual(new Set(['profile', 'cards:read']))
  })

  test('needs an expiry, a learner, an app, and scopes, each of its kind', async () => {
    const { keySet, sign } = await accessTokenSigner(accountUrl)
    const { azp: _, ...noApp } = claims
    await expect(verifiedAccessToken(await sign(claims, null), keySet, accountUrl)).rejects.toThrow(
      errors.JWTClaimValidationFailed
    )
    await expect(verifiedAccessToken(await sign(noApp), keySet, accountUrl)).rejects.toThrow(
      errors.JWTClaimValidationFailed
    )
    for (const odd of [{ sub: '' }, { azp: 7 }, { scope: ['profile'] }]) {
      expect(
        await verifiedAccessToken(await sign({ ...claims, ...odd }), keySet, accountUrl)
      ).toBeNull()
    }
  })

  test('is refused once expired, or made for another service', async () => {
    const { keySet, sign } = await accessTokenSigner(accountUrl)
    await expect(
      verifiedAccessToken(await sign(claims, now() - 60), keySet, accountUrl)
    ).rejects.toThrow(errors.JWTExpired)
    await expect(
      verifiedAccessToken(
        await sign(claims, undefined, 'https://other.example'),
        keySet,
        accountUrl
      )
    ).rejects.toThrow(errors.JWTClaimValidationFailed)
  })
})
