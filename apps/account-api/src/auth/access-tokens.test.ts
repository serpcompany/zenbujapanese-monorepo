import { accessTokenSigner, now } from '@zenbu/node-service/test/access-token-signer'
import { describe, expect, test } from 'vitest'
import { accessTokenVerifier } from './access-tokens'

const issuer = 'https://api.example.test'
const issuedAt = Math.floor(Date.UTC(2026, 9, 24) / 1000)

async function signer() {
  const { keys, sign } = await accessTokenSigner(issuer)
  return { verify: accessTokenVerifier(async () => keys, issuer), sign }
}

const claims = { sub: 'u1', azp: 'zenbu-web', scope: 'profile notes:write', auth_time: issuedAt }

describe('an access token', () => {
  test("names the learner, the app, and the app's own scopes, and when the learner signed in", async () => {
    const { verify, sign } = await signer()
    expect(await verify(await sign(claims))).toEqual({
      userId: 'u1',
      clientId: 'zenbu-web',
      scopes: new Set(['profile']),
      signedInAt: new Date(issuedAt * 1000)
    })
  })

  test('is refused without an expiry, an app, scopes, or a learner, as the dictionary service refuses it', async () => {
    const { verify, sign } = await signer()
    const { sub: _, ...noLearner } = claims
    const { azp: __, ...noApp } = claims
    const { scope: ___, ...noScopes } = claims
    for (const [covers, token] of [
      ['no expiry', await sign(claims, null)],
      ['no learner', await sign(noLearner)],
      ['an empty learner', await sign({ ...claims, sub: '' })],
      ['no app', await sign(noApp)],
      ['no scopes', await sign(noScopes)],
      ['scopes that are not text', await sign({ ...claims, scope: ['profile'] })],
      ['an app the service does not list', await sign({ ...claims, azp: 'someone-else' })],
      ['an expired one', await sign(claims, now() - 60)]
    ] as const) {
      expect(await verify(token), covers).toBeNull()
    }
  })
})
