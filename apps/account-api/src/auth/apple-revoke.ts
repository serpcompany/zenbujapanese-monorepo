import { log } from '@zenbu/node-service/log'
import { decodeJwt } from 'jose'
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

function appleUserOf(idToken: unknown): string | undefined {
  if (typeof idToken !== 'string') return undefined
  try {
    return decodeJwt(idToken).sub
  } catch {
    return undefined
  }
}

export function appleRevoker(apple: AuthConfig['apple'], publicUrl: string): AppleRevoker {
  const key = apple?.signingKey ?? null
  return {
    configured: key !== null,
    async revoke(authorizationCode, clientId, appleUserIds): Promise<AppleRevocation> {
      const app = clientById(clientId)
      const web = app?.signsInOnTheWeb ?? false
      const appleClientId = web ? apple?.servicesIds[0] : app?.appleBundleIds[0]
      if (!key || !appleClientId) {
        log('error', 'no Apple client to revoke a deletion with', { app: clientId })
        return 'unavailable'
      }
      const credentials = {
        client_id: appleClientId,
        client_secret: await appleClientSecret(key, appleClientId)
      }
      try {
        const exchanged = await post(appleToken, {
          ...credentials,
          code: authorizationCode,
          grant_type: 'authorization_code',
          ...(web ? { redirect_uri: `${publicUrl}/v1/auth/callback/apple` } : {})
        })
        const answer = (await exchanged.json().catch(() => ({}))) as Record<string, unknown>
        if (!exchanged.ok) {
          if (exchanged.status === 400 && answer.error === 'invalid_grant') return 'invalid'
          log('error', "apple refused a deletion's code exchange", {
            status: exchanged.status,
            appleError: typeof answer.error === 'string' ? answer.error : undefined
          })
          return 'unavailable'
        }
        if (typeof answer.refresh_token !== 'string') return 'invalid'
        const revoked = await post(appleRevoke, {
          ...credentials,
          token: answer.refresh_token,
          token_type_hint: 'refresh_token'
        })
        if (!revoked.ok) {
          log('warn', "apple didn't revoke on deletion", { status: revoked.status })
          return 'unavailable'
        }
        const owner = appleUserOf(answer.id_token)
        return owner && appleUserIds.includes(owner) ? 'revoked' : 'other_apple_id'
      } catch (error) {
        log('warn', 'apple was unreachable for a deletion', {
          error: error instanceof Error ? error.name : 'unknown'
        })
        return 'unavailable'
      }
    }
  }
}
