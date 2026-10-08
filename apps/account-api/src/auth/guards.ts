import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import type { Scope } from '../domain/clients'
import type { Mailer } from '../email/mailer'
import { requireSignInClient, sessionClient } from './clients'
import { emailProvider } from './identities'
import { consumeNonce } from './nonce'
import {
  offeredRoutes,
  route,
  routeScopes,
  routesNeedingAFreshSession,
  routesThatSendEmail
} from './routes'

const freshSessionMinutes = 10
const codesPerEmail = 5
const codeWindowMs = 10 * 60 * 1000
const linkingByRequest = new WeakMap<Request, string>()

type AuthContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0]

const isFresh = (createdAt: Date | string) =>
  Date.now() - new Date(createdAt).getTime() <= freshSessionMinutes * 60 * 1000

async function sessionOf(context: AuthContext) {
  const authorization =
    context.request?.headers.get('authorization') ?? context.headers?.get('authorization') ?? ''
  const token = /^bearer\s+(\S+)$/i.exec(authorization)?.[1]
  if (!token) return getSessionFromCtx(context).catch(() => null)
  const headers = new Headers(context.headers ?? context.request?.headers)
  headers.set('cookie', `${context.context.authCookies.sessionToken.name}=${token}`)
  return getSessionFromCtx({ ...context, headers }).catch(() => null)
}

async function freshSession(context: AuthContext) {
  const session = await sessionOf(context)
  return session && isFresh(session.session.createdAt) ? session : null
}

const insufficientScope = (scope: Scope) =>
  new APIError('FORBIDDEN', {
    code: 'INSUFFICIENT_SCOPE',
    message: `This app's access to the account doesn't include ${scope}.`
  })

async function requireScope(context: AuthContext, scope: Scope): Promise<void> {
  const session = await sessionOf(context)
  if (session && !sessionClient(session.session)?.scopes.includes(scope)) {
    throw insufficientScope(scope)
  }
}

async function requireListedApp(context: AuthContext): Promise<void> {
  const session = await sessionOf(context)
  if (session && !sessionClient(session.session)) {
    throw new APIError('UNAUTHORIZED', {
      code: 'SIGN_IN_AGAIN',
      message: 'This session belongs to no app the service lists. Sign in again.'
    })
  }
}

export interface CodesPerEmail {
  secondsToWait(email: unknown): number
  sent(email: unknown): void
}

export function codesPerEmailCounter(): CodesPerEmail {
  const sent = new Map<string, number[]>()
  const keyOf = (email: unknown) =>
    String(email ?? '')
      .trim()
      .toLowerCase()
  const recentTo = (key: string, now: number) =>
    (sent.get(key) ?? []).filter(at => now - at < codeWindowMs)
  return {
    secondsToWait(email) {
      const now = Date.now()
      const recent = recentTo(keyOf(email), now)
      if (recent.length < codesPerEmail) return 0
      return Math.max(1, Math.ceil((Math.min(...recent) + codeWindowMs - now) / 1000))
    },
    sent(email) {
      const now = Date.now()
      if (sent.size > 10_000) {
        for (const [key, times] of sent) {
          if (times.every(at => now - at >= codeWindowMs)) sent.delete(key)
        }
      }
      const key = keyOf(email)
      sent.set(key, [...recentTo(key, now), now])
    }
  }
}

async function requireFreshSession(context: AuthContext): Promise<void> {
  const session = await sessionOf(context)
  if (session && !isFresh(session.session.createdAt)) {
    throw new APIError('FORBIDDEN', {
      code: 'SESSION_NOT_FRESH',
      message: `Sign in again to change how you sign in: it needs a sign-in from the last ${freshSessionMinutes} minutes.`
    })
  }
}

function idTokenOf(body: Record<string, unknown>): { nonce?: unknown } | null {
  const idToken = body.idToken
  return typeof idToken === 'object' && idToken !== null ? (idToken as { nonce?: unknown }) : null
}

async function requireNonce(context: AuthContext, idToken: { nonce?: unknown }): Promise<void> {
  const nonce = typeof idToken.nonce === 'string' ? idToken.nonce : ''
  if (nonce === '') {
    throw new APIError('BAD_REQUEST', {
      code: 'NONCE_REQUIRED',
      message: `Ask for a nonce (POST /v1/auth${route.nonce}), pass it to Apple or Google, then send it here with their token.`
    })
  }
  if (!(await consumeNonce(context.context.internalAdapter, nonce))) {
    throw new APIError('UNAUTHORIZED', {
      code: 'INVALID_NONCE',
      message: 'The nonce is unknown, already used, or expired. Ask for a new one.'
    })
  }
}

function guardRequests(mailer: Mailer, trustedOrigins: readonly string[], codes: CodesPerEmail) {
  return createAuthMiddleware(async context => {
    const path = context.path
    if (!offeredRoutes.has(path)) {
      throw new APIError('NOT_FOUND', { code: 'NOT_FOUND', message: 'There is nothing here.' })
    }
    const scope = routeScopes.get(path)
    if (scope) await requireScope(context, scope)
    if (path === route.accessToken) await requireListedApp(context)
    if (routesThatSendEmail.has(path) && !mailer.available) {
      throw new APIError('SERVICE_UNAVAILABLE', {
        code: 'EMAIL_UNAVAILABLE',
        message: 'Signing in with an email code is not available right now.'
      })
    }
    const body = (context.body ?? {}) as Record<string, unknown>
    if (path === route.sendCode && body.type !== 'sign-in') {
      throw new APIError('BAD_REQUEST', {
        code: 'SIGN_IN_ONLY',
        message: 'A code is sent only to sign in.'
      })
    }
    const wait = path === route.sendCode ? codes.secondsToWait(body.email) : 0
    if (wait > 0) {
      throw new APIError(
        'TOO_MANY_REQUESTS',
        {
          code: 'TOO_MANY_REQUESTS',
          message: `At most ${codesPerEmail} codes go to one email in ${codeWindowMs / 60_000} minutes. Try again later.`
        },
        { 'Retry-After': String(wait), 'X-Retry-After': String(wait) }
      )
    }
    if (path === route.signInWithCode || path === route.signInWithProvider) {
      requireSignInClient(context.request?.headers ?? context.headers, path, body, trustedOrigins)
    }
    if (routesNeedingAFreshSession.has(path)) await requireFreshSession(context)
    const idToken = idTokenOf(body)
    if ((path === route.signInWithProvider || path === route.linkProvider) && idToken) {
      await requireNonce(context, idToken)
    }
    if (path === route.signInWithCode && context.request) {
      const session = await freshSession(context)
      if (session && !sessionClient(session.session)?.scopes.includes('account')) {
        throw insufficientScope('account')
      }
      if (session) linkingByRequest.set(context.request, session.user.id)
    }
  })
}

function guardEmailSignIn() {
  return createAuthMiddleware(async context => {
    if (context.path !== route.signInWithCode) return
    const created = context.context.newSession
    if (!created) return
    const adapter = context.context.internalAdapter
    const identities = await adapter.findAccounts(created.user.id)
    if (identities.some(identity => identity.providerId === emailProvider)) return
    const linking =
      context.request !== undefined && linkingByRequest.get(context.request) === created.user.id
    if (identities.length === 0 || linking) {
      await adapter.linkAccount({
        userId: created.user.id,
        providerId: emailProvider,
        accountId: created.user.email
      })
      return
    }
    await adapter.deleteSession(created.session.token)
    throw new APIError('FORBIDDEN', {
      code: 'ACCOUNT_NOT_LINKED',
      message:
        "This email's account signs in with Apple or Google. Sign in that way, then add your email."
    })
  })
}

export const signInGuards = (
  mailer: Mailer,
  trustedOrigins: readonly string[],
  codes: CodesPerEmail
) =>
  ({
    id: 'zenbu-sign-in-guards',
    hooks: {
      before: [{ matcher: () => true, handler: guardRequests(mailer, trustedOrigins, codes) }],
      after: [{ matcher: () => true, handler: guardEmailSignIn() }]
    }
  }) satisfies BetterAuthPlugin
