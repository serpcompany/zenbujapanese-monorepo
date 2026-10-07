import { exportJWK, generateKeyPair, type JWTPayload, SignJWT } from 'jose'
import { vi } from 'vitest'

const appleKeys = 'https://appleid.apple.com/auth/keys'
const appleToken = 'https://appleid.apple.com/auth/token'
const appleRevoke = 'https://appleid.apple.com/auth/revoke'
export const appleCodeFor = (appleUserId: string) => `apple-code:${appleUserId}`
export const misconfiguredAppleCode = 'invalid-client'
const googleKeys = 'https://www.googleapis.com/oauth2/v3/certs'

type Key = Awaited<ReturnType<typeof generateKeyPair>>['privateKey']

export interface IdentityProvider {
  issuer: string
  sign(claims: JWTPayload, options?: { key?: Key; kid?: string }): Promise<string>
  otherKey: Key
}

async function provider(issuer: string, kid: string) {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true })
  const { privateKey: otherKey } = await generateKeyPair('RS256', { extractable: true })
  const jwk = { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' }
  const signer: IdentityProvider = {
    issuer,
    otherKey,
    sign: (claims, options = {}) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: options.kid ?? kid })
        .sign(options.key ?? privateKey)
  }
  return { signer, keys: { keys: [jwk] } }
}

export async function standInForProviders() {
  const apple = await provider('https://appleid.apple.com', 'apple-test-key')
  const google = await provider('https://accounts.google.com', 'google-test-key')
  const realFetch = globalThis.fetch
  const answer = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' }
    })
  const appleRevoked: string[] = []
  const form = (init?: RequestInit) => new URLSearchParams(String(init?.body ?? ''))
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    if (url.startsWith(appleKeys)) return answer(apple.keys)
    if (url.startsWith(googleKeys)) return answer(google.keys)
    if (url === appleToken) {
      const code = form(init).get('code') ?? ''
      if (code === misconfiguredAppleCode) return answer({ error: 'invalid_client' }, 400)
      if (!code.startsWith('apple-code:')) return answer({ error: 'invalid_grant' }, 400)
      const idToken = await apple.signer.sign({ sub: code.slice('apple-code:'.length) })
      return answer({ refresh_token: `refresh-for-${code}`, id_token: idToken })
    }
    if (url === appleRevoke) {
      appleRevoked.push(form(init).get('token') ?? '')
      return new Response(null, { status: 200 })
    }
    return realFetch(input, init)
  })
  return { apple: apple.signer, google: google.signer, appleRevoked }
}

export function claims(
  provider: IdentityProvider,
  audience: string,
  subject: string,
  extra: JWTPayload = {}
): JWTPayload {
  const now = Math.floor(Date.now() / 1000)
  return {
    iss: provider.issuer,
    aud: audience,
    sub: subject,
    iat: now,
    exp: now + 600,
    email_verified: true,
    ...extra
  }
}
