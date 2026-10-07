import { log } from '@zenbu/node-service/log'
import type { AuthConfig } from '../config'
import type { AppleRevocation, AppleRevoker } from '../domain/account-deletion'
import { clientById } from '../domain/clients'
import { appleClientSecret } from './apple'

const appleToken = 'https://appleid.apple.com/auth/token'
const appleRevoke = 'https://appleid.apple.com/auth/revoke'
const timeoutMs = 10_000

const post = (url: string, fields: Record<string, string>) =>
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
    signal: AbortSignal.timeout(timeoutMs)
  })

export function appleRevoker(apple: AuthConfig['apple']): AppleRevoker {
  const key = apple?.signingKey ?? null
  return {
    configured: key !== null,
    async revoke(authorizationCode, clientId): Promise<AppleRevocation> {
      const appleClientId = clientById(clientId)?.appleBundleIds[0] ?? apple?.servicesIds[0]
      if (!key || !appleClientId) return 'unavailable'
      const client = {
        client_id: appleClientId,
        client_secret: await appleClientSecret(key, appleClientId)
      }
      try {
        const exchanged = await post(appleToken, {
          ...client,
          code: authorizationCode,
          grant_type: 'authorization_code'
        })
        if (exchanged.status === 400) return 'invalid'
        if (!exchanged.ok) {
          log('warn', "apple didn't exchange the code for deletion", { status: exchanged.status })
          return 'unavailable'
        }
        const { refresh_token: token } = (await exchanged.json()) as { refresh_token?: unknown }
        if (typeof token !== 'string') return 'invalid'
        const revoked = await post(appleRevoke, {
          ...client,
          token,
          token_type_hint: 'refresh_token'
        })
        if (!revoked.ok) log('warn', "apple didn't revoke on deletion", { status: revoked.status })
        return revoked.ok ? 'revoked' : 'unavailable'
      } catch (error) {
        log('warn', 'apple was unreachable for deletion', {
          error: error instanceof Error ? error.name : 'unknown'
        })
        return 'unavailable'
      }
    }
  }
}
