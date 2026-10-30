import { accountService } from '../service-worker/account/account-service'
import { accountApi, type Send } from '../service-worker/account/api'
import { startAccount } from '../service-worker/account/channel'
import type { Identity } from '../service-worker/account/identity'
import { signIns } from '../service-worker/account/sign-in'
import { accountStore, type StorageArea } from '../service-worker/account/store'
import { accessTokens } from '../service-worker/account/tokens'
import type { KeptSubscription } from '../shared/account'
import type { FakeExtension } from './extension'
import { extensionId } from './fake-chrome'

export { extensionId }

export const origin = 'http://account-api.localhost'

export const user = { id: 'user-1', email: 'learner@example.com' }

export function storageArea() {
  const items = new Map<string, unknown>()
  const area: StorageArea = {
    get: async keys =>
      Object.fromEntries(
        keys.filter(key => items.has(key)).map(key => [key, structuredClone(items.get(key))])
      ),
    set: async values => {
      Object.entries(values).map(([key, value]) => items.set(key, structuredClone(value)))
    },
    remove: async keys => {
      keys.map(key => items.delete(key))
    }
  }
  return { area, items }
}

export function json(status: number, value: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  })
}

export const refusal = (status: number, code: string, headers: Record<string, string> = {}) =>
  json(status, { error: { code, message: 'Refused.' } }, headers)

export function jwtWith(exp: number) {
  const part = (value: unknown) => btoa(JSON.stringify(value)).replaceAll('=', '')
  return `${part({ alg: 'EdDSA' })}.${part({ exp, azp: 'zenbu-extension' })}.signature`
}

type Asked = { route: string; headers: Headers; body: unknown; init: RequestInit }

type Route = (asked: Asked) => Response | Promise<Response>

export function standInService(routes: Record<string, Route>) {
  const asked: Asked[] = []
  const send: Send = async (url, init) => {
    const { pathname } = new URL(url)
    const route = `${init.method} ${pathname}`
    const headers = new Headers(init.headers)
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
    const call = { route, headers, body, init }
    asked.push(call)
    const answer = routes[route]
    return answer ? answer(call) : refusal(404, 'not_found')
  }
  return { send, asked, routes: () => asked.map(call => call.route) }
}

export const signedInAnswer = (sessionToken: string, signedIn = user) =>
  json(
    200,
    { token: sessionToken, user: { ...signedIn, name: 'Learner' } },
    {
      'set-auth-token': sessionToken
    }
  )

export const subscription: KeptSubscription = {
  status: 'none',
  active: false,
  managedIn: null,
  expiresAt: null,
  willRenew: null,
  running: [],
  canSubscribe: true,
  cloudAccess: 'subscription_required'
}

export function returnedFrom(launched: URL, values: Record<string, string>) {
  const state = launched.searchParams.get('state') ?? ''
  const at =
    launched.hostname === 'accounts.google.com'
      ? launched.searchParams.get('redirect_uri')
      : `https://${extensionId}.chromiumapp.org/apple`
  return `${at}#${new URLSearchParams({ state, ...values })}`
}

type Authorize = (launched: URL) => string | undefined | Promise<string | undefined>

export function standInIdentity(authorize: Authorize = launched => returnedFrom(launched, {})) {
  const launched: URL[] = []
  const identity: Identity = {
    getRedirectURL: path => `https://${extensionId}.chromiumapp.org/${path ?? ''}`,
    launchWebAuthFlow: async ({ url }) => {
      const parsed = new URL(url)
      launched.push(parsed)
      return authorize(parsed)
    }
  }
  return { identity, launched }
}

export function accountWorld(
  routes: Record<string, Route>,
  authorize?: Authorize,
  now: () => number = () => Date.parse('2026-10-30T09:00:00Z')
) {
  const service = standInService(routes)
  const local = storageArea()
  const session = storageArea()
  const { identity, launched } = standInIdentity(authorize)
  const api = accountApi(origin, service.send)
  const store = accountStore({ local: local.area, session: session.area })
  const tokens = accessTokens(api, store, now)
  const account = accountService({
    api,
    store,
    tokens,
    signIns: signIns(api, identity, {
      apiOrigin: origin,
      googleClientId: 'zenbu-extension-test.apps.googleusercontent.com',
      appleServicesId: 'com.zenbujapanese.website',
      extensionId
    })
  })
  return { ...service, local, session, launched, identity, api, store, tokens, account }
}

export async function signedInWorld(routes: Record<string, Route>, authorize?: Authorize) {
  const world = accountWorld(routes, authorize)
  await world.store.keepSignIn('session-earlier', user)
  return world
}

export function startAccountOn(
  fake: FakeExtension,
  routes: Record<string, Route>,
  authorize?: Authorize
) {
  const service = standInService(routes)
  const { identity, launched } = standInIdentity(authorize)
  const failures: string[] = []
  startAccount({
    storage: fake.chrome.storage,
    identity,
    extensionId,
    onMessage: fake.chrome.runtime.onMessage,
    onStartup: { addListener: () => undefined },
    send: service.send,
    reportFailure: code => failures.push(code)
  })
  return { ...service, launched, failures }
}
