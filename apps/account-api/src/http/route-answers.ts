import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { Principal, Scope } from '../domain/clients'
import type { AccountEnv } from './env'
import { errorBody } from './errors'
import { refusal } from './refusals'

export const bodyLimitKb = 64

export const needs = (...scopes: Scope[]) => [{ accessToken: scopes }]

export const needsOneOf = (...scopes: Scope[]) => scopes.map(scope => ({ accessToken: [scope] }))

export const noScope = (scope: Scope) => ({
  insufficient_scope: `This app's access to the account doesn't include \`${scope}\`.`
})

export const unauthorized = refusal({
  unauthorized:
    'No access token, or one that is expired, forged, or for an account that no longer exists. Get a new one from GET /v1/auth/token.'
})
export const tooLarge = refusal({ too_large: `The body is over ${bodyLimitKb} KB.` })
export const malformed = { bad_request: 'The body is not JSON, or not this shape.' }
export const tooMany = (perMinute: number) =>
  refusal({
    too_many_requests: `This account sent more than ${perMinute} requests here from this app in the current minute, or the app more than its limit from all its accounts together. Wait the seconds \`Retry-After\` says.`
  })
export const failed = refusal({
  internal: 'The service failed, and nothing says why. Try again later, backing off.'
})
export const failedSync = refusal({
  internal:
    'The service failed, and nothing says why. The mutations before the failure stand: send the same request again later, backing off, and those answer as before.'
})

const unauthorizedBody = errorBody(
  'unauthorized',
  'Send an access token from GET /v1/auth/token as `Authorization: Bearer <token>`.'
)

export function refuse(context: Context) {
  return context.json(unauthorizedBody, 401, { 'WWW-Authenticate': 'Bearer' })
}

export function requireAccount(verifyAccessToken: (token: string) => Promise<Principal | null>) {
  return createMiddleware<AccountEnv>(async (context, next) => {
    const token = /^bearer\s+(\S+)$/i.exec(context.req.header('authorization') ?? '')?.[1]
    const principal = token ? await verifyAccessToken(token) : null
    if (!principal) return refuse(context)
    context.set('userId', principal.userId)
    context.set('clientId', principal.clientId)
    context.set('scopes', principal.scopes)
    context.set('signedInAt', principal.signedInAt)
    await next()
  })
}

export function requireScope(...scopes: Scope[]) {
  const named = scopes.join(' or ')
  return createMiddleware<AccountEnv>(async (context, next) => {
    const granted = context.get('scopes')
    if (scopes.some(scope => granted.has(scope))) return next()
    return context.json(
      errorBody('insufficient_scope', `This app's access to the account doesn't include ${named}.`),
      403,
      { 'WWW-Authenticate': `Bearer error="insufficient_scope", scope="${scopes[0]}"` }
    )
  })
}
