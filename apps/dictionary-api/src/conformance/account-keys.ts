import { exportJWK, generateKeyPair, type JWTPayload, SignJWT } from 'jose'
import { accountTokens } from '../account-tokens'
import type { AppAccess } from '../app-routes'
import { perMinute } from '../rate-limit'

const accountUrl = 'https://accounts.test'

type Key = Awaited<ReturnType<typeof generateKeyPair>>['privateKey']

export interface TestAccountKeys {
  stranger: Key
  keyFetches(): number
  accessToken(
    claims?: JWTPayload,
    options?: { key?: Key; kid?: string; expires?: string | null }
  ): Promise<string>
  access(options?: { limit?: number; keysAnswer?: () => Response | undefined }): AppAccess
}

export async function testAccountKeys(): Promise<TestAccountKeys> {
  const pair = await generateKeyPair('EdDSA')
  const stranger = (await generateKeyPair('EdDSA')).privateKey
  const jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'current', alg: 'EdDSA' }] }
  let fetches = 0
  return {
    stranger,
    keyFetches: () => fetches,
    accessToken: (claims = {}, options = {}) => {
      const token = new SignJWT({
        iss: accountUrl,
        aud: accountUrl,
        sub: 'account-1',
        azp: 'tomodachi',
        scope: 'lists:read dictionary:read',
        auth_time: Math.floor(Date.now() / 1000),
        ...claims
      })
        .setProtectedHeader({ alg: 'EdDSA', kid: options.kid ?? 'current' })
        .setIssuedAt()
      if (options.expires !== null) token.setExpirationTime(options.expires ?? '15m')
      return token.sign(options.key ?? pair.privateKey)
    },
    access: (options = {}) => ({
      tokens: accountTokens({
        accountUrl,
        jwksUrl: `${accountUrl}/v1/auth/jwks`,
        fetch: async () => {
          fetches++
          return options.keysAnswer?.() ?? Response.json(jwks)
        }
      }),
      limit: perMinute(options.limit ?? 100)
    })
  }
}
