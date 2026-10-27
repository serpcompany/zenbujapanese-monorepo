import type {
  KindPage,
  KindQuery,
  Mutation,
  MutationResult
} from '@zenbu/account-rules/account-copy'
import type { Locale } from '../i18n/config'
import {
  type AccountSession,
  type Identity,
  identitiesOf,
  type Plans,
  type Profile,
  plansOf,
  profileOf,
  type Refusal,
  refusalOf,
  type Subscription,
  sessionOf,
  signedInUserOf,
  subscriptionOf,
  textAnswer,
  trueAnswer
} from './answers'
import { kindPageOf, mutationResultsOf } from './synced-answers'

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

export interface CheckoutPages {
  price: string
  successUrl: string
  cancelUrl: string
}

export interface Deleted {
  appStoreSubscriptionContinues: boolean
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

const offline: Result<never> = { ok: false, failure: { kind: 'offline' } }

async function refused(response: Response): Promise<Result<never>> {
  const { value } = await jsonOf(response)
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

export function accountApi(
  apiUrl: string,
  language: Locale,
  send: typeof fetch = (...args) => fetch(...args)
) {
  async function call<T>(
    path: string,
    { method = 'GET', body, accessToken, signsIn = false }: Call,
    read: (value: unknown, status: number) => Result<T>
  ): Promise<Result<T>> {
    const headers: Record<string, string> = { 'content-language': language }
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
      return offline
    }
    if (!response.ok) return refused(response)
    const { parsed, value } = await jsonOf(response)
    return parsed ? read(value, response.status) : unexpected(response.status)
  }

  async function file(path: string, accessToken: string): Promise<Result<Blob>> {
    try {
      const response = await send(`${apiUrl}${path}`, {
        headers: { 'content-language': language, authorization: `Bearer ${accessToken}` },
        credentials: 'omit'
      })
      return response.ok ? accepted(await response.blob()) : refused(response)
    } catch {
      return offline
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
          textAnswer(value, 'status') === 'deleted'
            ? accepted<Deleted>({
                appStoreSubscriptionContinues: trueAnswer(value, 'appStoreSubscriptionContinues')
              })
            : unexpected(status)
      ),
    subscription: (accessToken: string) =>
      call('/v1/me/subscription', { accessToken }, (value, status) =>
        checked<Subscription>(subscriptionOf(value), status)
      ),
    plans: (accessToken: string) =>
      call('/v1/me/subscription/plans', { accessToken }, (value, status) =>
        checked<Plans>(plansOf(value), status)
      ),
    checkout: (accessToken: string, pages: CheckoutPages) =>
      call(
        '/v1/me/subscription/checkout',
        { method: 'POST', accessToken, body: pages },
        providerPage
      ),
    readKind: (accessToken: string, entity: string, query: KindQuery) =>
      call(
        `/v1/sync/${encodeURIComponent(entity)}?${new URLSearchParams(
          Object.entries(query).map(([key, value]) => [key, String(value)])
        )}`,
        { accessToken },
        (value, status) => checked<KindPage>(kindPageOf(value), status)
      ),
    photoFile: (accessToken: string, photoId: string) =>
      file(`/v1/photos/${encodeURIComponent(photoId)}`, accessToken),
    sync: (accessToken: string, mutations: Mutation[]) =>
      call(
        '/v1/sync',
        { method: 'POST', accessToken, body: { mutations, limit: 1 } },
        (value, status) => checked<MutationResult[]>(mutationResultsOf(value), status)
      ),
    portal: (accessToken: string, returnUrl: string) =>
      call(
        '/v1/me/subscription/portal',
        { method: 'POST', accessToken, body: { returnUrl } },
        providerPage
      )
  }
}

export type AccountApi = ReturnType<typeof accountApi>
