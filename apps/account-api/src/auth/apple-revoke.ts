import { log } from '@zenbu/node-service/log'
import { decodeJwt } from 'jose'
import type { AuthConfig } from '../config'
import type { AppleRevocation, AppleRevoker } from '../domain/account-deletion'
import { clientById } from '../domain/clients'
import { appleClientSecret } from './apple'

const appleToken = 'https://appleid.apple.com/auth/token'
const appleRevoke = 'https://appleid.apple.com/auth/revoke'
const timeoutMs = 10_000

type Credentials = { client_id: string; client_secret: string }
type Grant = { refreshToken: string; owner: string }

const text = (answer: unknown, key: string) => {
  const value = typeof answer === 'object' && answer !== null ? Reflect.get(answer, key) : undefined
  return typeof value === 'string' ? value : undefined
}

const post = (url: string, fields: Record<string, string>) =>
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
    signal: AbortSignal.timeout(timeoutMs)
  })

function appleUserOf(idToken: string | undefined): string | undefined {
  if (idToken === undefined) return undefined
  try {
    return decodeJwt(idToken).sub
  } catch {
    return undefined
  }
}

const unreachable = (error: unknown): AppleRevocation => {
  log('warn', 'apple was unreachable for a deletion', {
    error: error instanceof Error ? error.name : 'unknown'
  })
  return 'unavailable'
}

async function exchange(
  credentials: Credentials,
  code: string,
  redirectUri: string | undefined
): Promise<Grant | AppleRevocation> {
  try {
    const exchanged = await post(appleToken, {
      ...credentials,
      code,
      grant_type: 'authorization_code',
      ...(redirectUri ? { redirect_uri: redirectUri } : {})
    })
    const answer: unknown = await exchanged.json().catch(() => null)
    if (!exchanged.ok) {
      const appleError = text(answer, 'error')
      if (exchanged.status === 400 && appleError === 'invalid_grant') return 'invalid'
      log('error', "apple refused a deletion's code exchange", {
        status: exchanged.status,
        appleError
      })
      return 'unavailable'
    }
    const refreshToken = text(answer, 'refresh_token')
    const owner = appleUserOf(text(answer, 'id_token'))
    if (refreshToken === undefined || owner === undefined) {
      log('error', "apple's code exchange named no refresh token or Apple ID", {
        refreshToken: refreshToken !== undefined,
        appleId: owner !== undefined
      })
      return 'unavailable'
    }
    return { refreshToken, owner }
  } catch (error) {
    return unreachable(error)
  }
}

async function revokeGrant(credentials: Credentials, refreshToken: string) {
  try {
    const revoked = await post(appleRevoke, {
      ...credentials,
      token: refreshToken,
      token_type_hint: 'refresh_token'
    })
    if (revoked.ok) return 'revoked'
    log('warn', "apple didn't revoke on deletion", { status: revoked.status })
    return 'unavailable'
  } catch (error) {
    return unreachable(error)
  }
}

export function appleRevoker(apple: AuthConfig['apple'], publicUrl: string): AppleRevoker {
  const key = apple?.signingKey ?? null
  return {
    configured: key !== null,
    async revoke({ code, redirectUri }, clientId, appleUserIds, inUse): Promise<AppleRevocation> {
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
      const grant = await exchange(
        credentials,
        code,
        web ? (redirectUri ?? `${publicUrl}/v1/auth/callback/apple`) : undefined
      )
      if (typeof grant === 'string') return grant
      const ours = appleUserIds.includes(grant.owner)
      if (!ours && (await inUse(grant.owner))) return 'other_apple_id'
      const revoked = await revokeGrant(credentials, grant.refreshToken)
      if (revoked !== 'revoked') return revoked
      return ours ? 'revoked' : 'other_apple_id'
    }
  }
}
