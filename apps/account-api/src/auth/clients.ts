import type { BetterAuthOptions } from 'better-auth'
import { APIError } from 'better-auth/api'
import { decodeJwt } from 'jose'
import { type Client, clientById, clients, webClient } from '../domain/clients'

const clientHeader = 'x-zenbu-client'

function signInClient(
  headers: Headers | undefined,
  path: string | undefined,
  trustedOrigins: readonly string[]
): Client | null {
  if (path?.startsWith('/callback/')) return webClient
  const named = headers?.get(clientHeader)
  if (named) return clientById(named)
  const origin = headers?.get('origin')
  return origin && trustedOrigins.includes(origin) ? webClient : null
}

const unknownClient = () =>
  new APIError('BAD_REQUEST', {
    code: 'UNKNOWN_CLIENT',
    message: `Name the app signing in in the ${clientHeader} header, as the account service lists it.`
  })

function appleAudiences(idToken: unknown): string[] {
  const token = (idToken as { token?: unknown } | null)?.token
  if (typeof token !== 'string') return []
  try {
    const { aud } = decodeJwt(token)
    return Array.isArray(aud) ? aud : typeof aud === 'string' ? [aud] : []
  } catch {
    return []
  }
}

export function requireSignInClient(
  headers: Headers | undefined,
  path: string,
  body: Record<string, unknown>,
  trustedOrigins: readonly string[]
): void {
  const client = signInClient(headers, path, trustedOrigins)
  if (!client) throw unknownClient()
  if (body.provider !== 'apple') return
  const owner = clients.find(other =>
    appleAudiences(body.idToken).some(audience => other.appleBundleIds.includes(audience))
  )
  if (owner && owner.id !== client.id) {
    throw new APIError('FORBIDDEN', {
      code: 'CLIENT_MISMATCH',
      message: `That Sign in with Apple token is ${owner.name}'s, not ${client.name}'s.`
    })
  }
}

export function sessionClientHooks(trustedOrigins: readonly string[]) {
  return {
    session: {
      create: {
        async before(session, context) {
          const headers = context?.request?.headers ?? context?.headers
          const client = signInClient(headers, context?.path, trustedOrigins)
          return { data: { ...session, clientId: client?.id ?? null } }
        }
      }
    }
  } satisfies BetterAuthOptions['databaseHooks']
}

export function tokenClaims(clientId: unknown): Record<string, string> {
  const client = clientById(typeof clientId === 'string' ? clientId : null)
  return client ? { azp: client.id, scope: client.scopes.join(' ') } : {}
}
