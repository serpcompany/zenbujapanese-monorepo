import type { Refusal } from '../../shared/account'
import { fields } from '../../shared/messages'
import { sha256Hex } from '../../shared/sha256'

export type Identity = {
  launchWebAuthFlow(details: { url: string; interactive: boolean }): Promise<string | undefined>
  getRedirectURL(path?: string): string
}

export const googleAuthorizeUrl = 'https://accounts.google.com/o/oauth2/v2/auth'

export const appleAuthorizeUrl = 'https://appleid.apple.com/auth/authorize'

export const appleReturnPath = '/v1/auth/apple/extension'

type Name = { firstName?: string; lastName?: string }

type Authorized = { idToken: string; code: string | null; name: Name | null }

export type Authorization = { ok: true; authorized: Authorized } | { ok: false; refusal: Refusal }

const cancelledErrors = ['access_denied', 'user_cancelled_authorize']

async function returnedFields(identity: Identity, url: URL): Promise<URLSearchParams | Refusal> {
  try {
    const returned = await identity.launchWebAuthFlow({ url: url.href, interactive: true })
    if (returned === undefined) return 'cancelled'
    return new URLSearchParams(new URL(returned).hash.slice(1))
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    return /did not approve|cancel|closed/i.test(message) ? 'cancelled' : 'try-again'
  }
}

function nameOf(user: string | null): Name | null {
  if (user === null) return null
  try {
    const name = fields(fields(JSON.parse(user))?.name)
    const part = (value: unknown) => (typeof value === 'string' && value !== '' ? value : undefined)
    const firstName = part(name?.firstName)
    const lastName = part(name?.lastName)
    return firstName || lastName ? { firstName, lastName } : null
  } catch {
    return null
  }
}

function authorizationOf(returned: URLSearchParams | Refusal, state: string): Authorization {
  if (typeof returned === 'string') return { ok: false, refusal: returned }
  const error = returned.get('error')
  if (error !== null) {
    return { ok: false, refusal: cancelledErrors.includes(error) ? 'cancelled' : 'try-again' }
  }
  const idToken = returned.get('id_token')
  if (returned.get('state') !== state || idToken === null)
    return { ok: false, refusal: 'try-again' }
  return {
    ok: true,
    authorized: { idToken, code: returned.get('code'), name: nameOf(returned.get('user')) }
  }
}

export async function authorizeWithGoogle(
  identity: Identity,
  clientId: string,
  nonce: string
): Promise<Authorization> {
  const state = crypto.randomUUID()
  const url = new URL(googleAuthorizeUrl)
  url.search = new URLSearchParams({
    client_id: clientId,
    response_type: 'id_token',
    scope: 'openid email profile',
    nonce,
    state,
    redirect_uri: identity.getRedirectURL('google'),
    prompt: 'select_account'
  }).toString()
  return authorizationOf(await returnedFields(identity, url), state)
}

export async function authorizeWithApple(
  identity: Identity,
  {
    servicesId,
    apiOrigin,
    extensionId
  }: { servicesId: string; apiOrigin: string; extensionId: string },
  nonce: string
): Promise<Authorization> {
  const state = `${extensionId}.${crypto.randomUUID()}`
  const url = new URL(appleAuthorizeUrl)
  url.search = new URLSearchParams({
    client_id: servicesId,
    redirect_uri: `${apiOrigin}${appleReturnPath}`,
    response_type: 'code id_token',
    response_mode: 'form_post',
    scope: 'name email',
    nonce: await sha256Hex(new TextEncoder().encode(nonce)),
    state
  }).toString()
  return authorizationOf(await returnedFields(identity, url), state)
}
