import {
  type AccountSession,
  type Identity,
  identitiesOf,
  type Profile,
  profileOf,
  type Refusal,
  refusalOf,
  sessionOf,
  signedInUserOf,
  textAnswer,
  trueAnswer
} from './answers'

export type Failure =
  | { kind: 'offline' }
  | { kind: 'unexpected'; status: number }
  | ({ kind: 'refused'; status: number; retryAfter: number | null } & Refusal)

export type Result<T> = { ok: true; value: T } | { ok: false; failure: Failure }

export interface AppleSignIn {
  idToken: string
  nonce: string
  name: { firstName?: string; lastName?: string } | null
}

export interface WebReturn {
  callbackURL: string
  errorCallbackURL: string
}

export interface ProfileChange {
  baseVersion: number
  name?: string
  username?: string | null
}

export interface AppleAuthorizationForDeletion {
  appleAuthorizationCode: string
  appleRedirectUri: string
}

const websiteClient = 'zenbu-web'

interface Call {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  accessToken?: string
  signsIn?: boolean
}

function retryAfterOf(headers: Headers): number | null {
  const seconds = Number(headers.get('retry-after') ?? headers.get('x-retry-after') ?? '')
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null
}

async function jsonOf(response: Response): Promise<{ parsed: boolean; value: unknown }> {
  const text = await response.text().catch(() => null)
  if (text === null) return { parsed: false, value: null }
  if (text === '') return { parsed: true, value: null }
  try {
    return { parsed: true, value: JSON.parse(text) }
  } catch {
    return { parsed: false, value: null }
  }
}

const accepted = <T>(value: T): Result<T> => ({ ok: true, value })
const unexpected = (status: number): Result<never> => ({
  ok: false,
  failure: { kind: 'unexpected', status }
})

const checked = <T>(value: T | null, status: number): Result<T> =>
  value === null ? unexpected(status) : accepted(value)

export function accountApi(apiUrl: string, send: typeof fetch = (...args) => fetch(...args)) {
  async function call<T>(
    path: string,
    { method = 'GET', body, accessToken, signsIn = false }: Call,
    read: (value: unknown, status: number) => Result<T>
  ): Promise<Result<T>> {
    const headers: Record<string, string> = {}
    if (body !== undefined) headers['content-type'] = 'application/json'
    if (accessToken) headers.authorization = `Bearer ${accessToken}`
    if (signsIn) headers['x-zenbu-client'] = websiteClient
    let response: Response
    try {
      response = await send(`${apiUrl}${path}`, {
        method,
        headers,
        credentials: accessToken ? 'omit' : 'include',
        body: body === undefined ? undefined : JSON.stringify(body)
      })
    } catch {
      return { ok: false, failure: { kind: 'offline' } }
    }
    const { parsed, value } = await jsonOf(response)
    if (response.ok) return parsed ? read(value, response.status) : unexpected(response.status)
    return {
      ok: false,
      failure: {
        kind: 'refused',
        status: response.status,
        retryAfter: retryAfterOf(response.headers),
        ...refusalOf(value, response.status)
      }
    }
  }

  const signedIn = (value: unknown, status: number) => checked(signedInUserOf(value), status)

  const providerPage = (value: unknown, status: number) => {
    const url = textAnswer(value, 'url')
    return checked(url !== null && /^https:\/\//.test(url) ? url : null, status)
  }

  const done = (key: string) => (value: unknown, status: number) =>
    trueAnswer(value, key) ? accepted(true) : unexpected(status)

  return {
    sendCode: (email: string) =>
      call(
        '/v1/auth/email-otp/send-verification-otp',
        { method: 'POST', body: { email, type: 'sign-in' } },
        done('success')
      ),
    signInWithCode: (email: string, otp: string) =>
      call(
        '/v1/auth/sign-in/email-otp',
        { method: 'POST', body: { email, otp }, signsIn: true },
        signedIn
      ),
    nonce: () =>
      call('/v1/auth/sign-in/nonce', { method: 'POST', body: {} }, (value, status) =>
        checked(textAnswer(value, 'nonce'), status)
      ),
    signInWithApple: ({ idToken, nonce, name }: AppleSignIn) =>
      call(
        '/v1/auth/sign-in/social',
        {
          method: 'POST',
          signsIn: true,
          body: {
            provider: 'apple',
            idToken: { token: idToken, nonce, ...(name ? { user: { name } } : {}) }
          }
        },
        signedIn
      ),
    startGoogle: (back: WebReturn) =>
      call(
        '/v1/auth/sign-in/social',
        { method: 'POST', signsIn: true, body: { provider: 'google', ...back } },
        providerPage
      ),
    linkApple: ({ idToken, nonce }: AppleSignIn) =>
      call(
        '/v1/auth/link-social',
        { method: 'POST', body: { provider: 'apple', idToken: { token: idToken, nonce } } },
        done('status')
      ),
    startLinkingGoogle: (back: WebReturn) =>
      call(
        '/v1/auth/link-social',
        { method: 'POST', body: { provider: 'google', ...back } },
        providerPage
      ),
    session: () =>
      call('/v1/auth/get-session', {}, (value, status) => {
        const session = sessionOf(value)
        return session === undefined ? unexpected(status) : accepted<AccountSession | null>(session)
      }),
    accessToken: () =>
      call('/v1/auth/token', {}, (value, status) => checked(textAnswer(value, 'token'), status)),
    identities: () =>
      call('/v1/auth/list-accounts', {}, (value, status) =>
        checked<Identity[]>(identitiesOf(value), status)
      ),
    unlink: (identityId: string) =>
      call(
        '/v1/auth/unlink-account',
        { method: 'POST', body: { accountId: identityId } },
        done('status')
      ),
    revokeSession: (sessionToken: string) =>
      call(
        '/v1/auth/revoke-session',
        { method: 'POST', body: { token: sessionToken } },
        done('status')
      ),
    signOut: () => call('/v1/auth/sign-out', { method: 'POST', body: {} }, done('success')),
    profile: (accessToken: string) =>
      call('/v1/me', { accessToken }, (value, status) =>
        checked<Profile>(profileOf(value), status)
      ),
    changeProfile: (accessToken: string, change: ProfileChange) =>
      call('/v1/me', { method: 'PATCH', accessToken, body: change }, (value, status) =>
        checked<Profile>(profileOf(value), status)
      ),
    deleteAccount: (accessToken: string, apple: AppleAuthorizationForDeletion | null) =>
      call(
        '/v1/me',
        { method: 'DELETE', accessToken, body: { confirm: true, ...apple } },
        (value, status) =>
          textAnswer(value, 'status') === 'deleted' ? accepted(true) : unexpected(status)
      )
  }
}

export type AccountApi = ReturnType<typeof accountApi>
