import { isFields, jwtClaims } from './answers'
import type { Failure, Result } from './client'

const appleScriptUrl =
  'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js'

interface AppleConfig {
  clientId: string
  scope: string
  redirectURI: string
  state: string
  nonce: string
  usePopup: true
}

export interface AppleAuth {
  init(config: AppleConfig): void
  signIn(): Promise<unknown>
}

declare global {
  interface Window {
    AppleID?: { auth?: AppleAuth }
  }
}

export interface AppleAuthorization {
  code: string
  idToken: string
  name: { firstName?: string; lastName?: string } | null
}

export interface AppleCode {
  code: string
  returnUrl: string
}

export type ApplePopup =
  | { ok: true; authorization: AppleAuthorization }
  | { ok: false; reason: 'cancelled' | 'blocked' | 'failed' }

export const appleReturnUrl = (origin: string) => `${origin}/account/`

export function appleAuthorizationOf(answer: unknown, state: string): AppleAuthorization | null {
  if (!isFields(answer) || !isFields(answer.authorization)) return null
  const { code, id_token: idToken, state: returned } = answer.authorization
  if (typeof code !== 'string' || typeof idToken !== 'string' || returned !== state) return null
  const name = isFields(answer.user) && isFields(answer.user.name) ? answer.user.name : null
  const part = (key: string) =>
    typeof name?.[key] === 'string' ? (name[key] as string) : undefined
  return {
    code,
    idToken,
    name: name ? { firstName: part('firstName'), lastName: part('lastName') } : null
  }
}

export function appleUserOf(idToken: string): string | null {
  const sub = jwtClaims(idToken)?.sub
  return typeof sub === 'string' ? sub : null
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function popupFailure(error: unknown): ApplePopup {
  const code = isFields(error) && typeof error.error === 'string' ? error.error : ''
  if (code === 'popup_closed_by_user' || code === 'user_cancelled_authorize') {
    return { ok: false, reason: 'cancelled' }
  }
  return { ok: false, reason: code === 'popup_blocked_by_browser' ? 'blocked' : 'failed' }
}

export async function signInWithApplePopup(
  auth: AppleAuth,
  { clientId, nonceHash, redirectURI }: { clientId: string; nonceHash: string; redirectURI: string }
): Promise<ApplePopup> {
  const state = crypto.randomUUID()
  auth.init({ clientId, scope: 'name email', redirectURI, state, nonce: nonceHash, usePopup: true })
  try {
    const authorization = appleAuthorizationOf(await auth.signIn(), state)
    return authorization ? { ok: true, authorization } : { ok: false, reason: 'failed' }
  } catch (error) {
    return popupFailure(error)
  }
}

let loading: Promise<AppleAuth | null> | null = null

function appleAuthOnThePage(): AppleAuth | null {
  const auth: unknown = window.AppleID?.auth
  return isFields(auth) && typeof auth.init === 'function' && typeof auth.signIn === 'function'
    ? (auth as unknown as AppleAuth)
    : null
}

function loadAppleAuth(): Promise<AppleAuth | null> {
  const loaded = appleAuthOnThePage()
  if (loaded) return Promise.resolve(loaded)
  loading ??= new Promise(resolve => {
    const script = document.createElement('script')
    script.src = appleScriptUrl
    script.async = true
    script.onload = () => resolve(appleAuthOnThePage())
    script.onerror = () => {
      loading = null
      resolve(null)
    }
    document.head.appendChild(script)
  })
  return loading
}

interface PreparedApple {
  auth: AppleAuth
  nonce: string
  nonceHash: string
}

export type ApplePreparation =
  | { ok: true; prepared: PreparedApple }
  | { ok: false; failure: Failure | null }

export async function prepareApple(
  nonce: () => Promise<Result<string>>
): Promise<ApplePreparation> {
  const [auth, issued] = await Promise.all([loadAppleAuth(), nonce()])
  if (!issued.ok) return { ok: false, failure: issued.failure }
  if (!auth) return { ok: false, failure: null }
  return {
    ok: true,
    prepared: { auth, nonce: issued.value, nonceHash: await sha256Hex(issued.value) }
  }
}
