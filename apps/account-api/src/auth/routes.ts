import type { Scope } from '../domain/clients'

export const authPath = '/v1/auth'

export const route = {
  sendCode: '/email-otp/send-verification-otp',
  signInWithCode: '/sign-in/email-otp',
  signInWithProvider: '/sign-in/social',
  providerCallback: '/callback/:id',
  nonce: '/sign-in/nonce',
  linkProvider: '/link-social',
  unlink: '/unlink-account',
  accessToken: '/token',
  keys: '/jwks',
  session: '/get-session',
  signOut: '/sign-out',
  identities: '/list-accounts',
  sessions: '/list-sessions',
  revokeSession: '/revoke-session',
  revokeSessions: '/revoke-sessions',
  revokeOtherSessions: '/revoke-other-sessions'
} as const

export const offeredRoutes: ReadonlySet<string> = new Set(Object.values(route))

export const routesNeedingAFreshSession: ReadonlySet<string> = new Set([
  route.linkProvider,
  route.unlink
])

export const routesThatSendEmail: ReadonlySet<string> = new Set([route.sendCode])

export const routeScopes: ReadonlyMap<string, Scope> = new Map([
  [route.linkProvider, 'account'],
  [route.unlink, 'account'],
  [route.identities, 'account'],
  [route.sessions, 'account'],
  [route.revokeSession, 'account'],
  [route.revokeSessions, 'account'],
  [route.revokeOtherSessions, 'account'],
  [route.session, 'profile']
])
