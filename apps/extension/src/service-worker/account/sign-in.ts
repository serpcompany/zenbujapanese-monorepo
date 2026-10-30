import { type Refused, refused, type SignInWay } from '../../shared/account'
import { fields } from '../../shared/messages'
import type { Answered, Api } from './api'
import {
  type Authorization,
  authorizeWithApple,
  authorizeWithGoogle,
  type Identity
} from './identity'
import type { User } from './store'

export type SignInSettings = {
  apiOrigin: string
  googleClientId: string | null
  appleServicesId: string
  extensionId: string
}

export type SignedIn = { ok: true; sessionToken: string; user: User; appleCode: string | null }

export type SignInResult = SignedIn | { ok: false; refused: Refused }

const refusalByCode: Record<string, Refused['refusal']> = {
  invalid_otp: 'wrong-code',
  otp_expired: 'new-code',
  too_many_attempts: 'new-code',
  oauth_link_error: 'has-other-way',
  account_not_linked: 'other-way',
  email_unavailable: 'no-email',
  email_not_verified: 'cannot',
  client_mismatch: 'cannot',
  unknown_client: 'cannot',
  provider_not_found: 'cannot',
  insufficient_scope: 'cannot',
  sign_in_again: 'sign-in-again',
  signed_out: 'sign-in-again',
  session_not_fresh: 'sign-in-again',
  apple_authorization_invalid: 'apple-again',
  apple_account_mismatch: 'apple-again',
  apple_unavailable: 'apple-again'
}

export function refusedFor(answer: Answered): Refused {
  if (answer.ok) return refused('try-again')
  if (answer.status === 429) return refused('wait', answer.retryAfter)
  return refused(refusalByCode[answer.code] ?? 'try-again')
}

function signedInOf(answer: Answered, appleCode: string | null): SignInResult {
  if (!answer.ok) return { ok: false, refused: refusedFor(answer) }
  const user = fields(answer.value.user)
  const id = user?.id
  const email = user?.email
  if (answer.sessionToken === null || typeof id !== 'string' || typeof email !== 'string') {
    return { ok: false, refused: refused('try-again') }
  }
  return { ok: true, sessionToken: answer.sessionToken, user: { id, email }, appleCode }
}

export function signIns(api: Api, identity: Identity, settings: SignInSettings) {
  async function nonce(): Promise<string | Refused> {
    const answer = await api({ method: 'POST', path: '/v1/auth/sign-in/nonce', body: {} })
    if (answer.ok && typeof answer.value.nonce === 'string') return answer.value.nonce
    return refusedFor(answer)
  }

  async function withProvider(
    provider: 'google' | 'apple',
    authorize: (nonce: string) => Promise<Authorization>
  ): Promise<SignInResult> {
    const once = await nonce()
    if (typeof once !== 'string') return { ok: false, refused: once }
    const authorization = await authorize(once)
    if (!authorization.ok) return { ok: false, refused: refused(authorization.refusal) }
    const { idToken, code, name } = authorization.authorized
    const answer = await api({
      method: 'POST',
      path: '/v1/auth/sign-in/social',
      signIn: true,
      body: {
        provider,
        idToken: { token: idToken, nonce: once, ...(name ? { user: { name } } : {}) }
      }
    })
    return signedInOf(answer, code)
  }

  const appleSettings = {
    servicesId: settings.appleServicesId,
    apiOrigin: settings.apiOrigin,
    extensionId: settings.extensionId
  }

  async function withApple(): Promise<SignInResult> {
    return withProvider('apple', once => authorizeWithApple(identity, appleSettings, once))
  }

  async function withGoogle(): Promise<SignInResult> {
    const clientId = settings.googleClientId
    if (clientId === null) return { ok: false, refused: refused('cannot') }
    return withProvider('google', once => authorizeWithGoogle(identity, clientId, once))
  }

  async function withCode(email: string, code: string): Promise<SignInResult> {
    const answer = await api({
      method: 'POST',
      path: '/v1/auth/sign-in/email-otp',
      signIn: true,
      body: { email, otp: code }
    })
    return signedInOf(answer, null)
  }

  return {
    sendCode: async (email: string): Promise<Refused | null> => {
      const answer = await api({
        method: 'POST',
        path: '/v1/auth/email-otp/send-verification-otp',
        signIn: true,
        body: { email, type: 'sign-in' }
      })
      return answer.ok ? null : refusedFor(answer)
    },
    withWebsiteCode: async (code: string): Promise<SignInResult> =>
      signedInOf(
        await api({
          method: 'POST',
          path: '/v1/auth/sign-in/extension-code',
          signIn: true,
          body: { code }
        }),
        null
      ),
    signIn: (way: SignInWay): Promise<SignInResult> =>
      way.way === 'code'
        ? withCode(way.email, way.code)
        : way.way === 'google'
          ? withGoogle()
          : withApple()
  }
}

export type SignIns = ReturnType<typeof signIns>
