import type { z } from '@hono/zod-openapi'
import { describe, expect, test } from 'vitest'
import { authPath, offeredRoutes, routeScopes } from '../auth/routes'
import { sessionToken, useSignInService } from '../test/sign-in'
import { signInRoutes } from './sign-in-contract'

const running = useSignInService({ providers: true })

type Route = (typeof signInRoutes)[keyof typeof signInRoutes]

function answerSchema(route: Route): z.ZodType {
  const answer = (
    route.responses as Record<number, { content?: { 'application/json': { schema: z.ZodType } } }>
  )[200]
  const schema = answer?.content?.['application/json'].schema
  if (!schema) throw new Error(`${route.path} declares no 200 body`)
  return schema
}

async function holds(route: Route, call: Promise<{ status: number; body: unknown }>) {
  const answer = await call
  expect(answer.status, route.path).toBe(200)
  const parsed = answerSchema(route).safeParse(answer.body)
  expect(parsed.error?.issues ?? [], route.path).toEqual([])
}

describe("sign-in's contract", () => {
  test('documents exactly the sign-in routes the service opens', () => {
    const documented = Object.values(signInRoutes).map(route =>
      route.path.replace(authPath, '').replace(/\{(\w+)\}/g, ':$1')
    )
    expect(documented.sort()).toEqual([...offeredRoutes].sort())
  })

  test('names the scope each sign-in route checks', () => {
    for (const route of Object.values(signInRoutes)) {
      const path = route.path.replace(authPath, '').replace(/\{(\w+)\}/g, ':$1')
      const declared = 'security' in route ? route.security.flatMap(each => each.sessionToken) : []
      const checked = routeScopes.get(path)
      expect(declared, route.path).toEqual(checked ? [checked] : [])
    }
  })

  test('matches what each route answers', async () => {
    const { service, as } = running
    const call = service.call
    await holds(
      signInRoutes.sendCode,
      call('/v1/auth/email-otp/send-verification-otp', {
        body: { email: 'contract@example.com', type: 'sign-in' }
      })
    )
    const byCode = await as.withCode('contract@example.com')
    await holds(signInRoutes.signInWithCode, Promise.resolve(byCode))
    expect(byCode.headers.get('set-auth-token')).toMatch(/\./)
    const session = sessionToken(byCode)
    await holds(signInRoutes.nonce, call('/v1/auth/sign-in/nonce', { body: {} }))
    const nonce = await as.nonce()
    const google = await as.idToken(
      running.google,
      'web.apps.googleusercontent.com',
      'contract-g',
      'contract-g@example.com',
      nonce
    )
    await holds(signInRoutes.signInWithProvider, as.withIdToken('google', google, nonce))
    await holds(
      signInRoutes.signInWithProvider,
      call('/v1/auth/sign-in/social', { body: { provider: 'google', callbackURL: '/' } })
    )
    await holds(signInRoutes.accessToken, call('/v1/auth/token', { token: session }))
    await holds(signInRoutes.keys, call('/v1/auth/jwks'))
    await holds(signInRoutes.session, call('/v1/auth/get-session', { token: session }))
    await holds(signInRoutes.session, call('/v1/auth/get-session'))
    const linkNonce = await as.nonce()
    const linking = await as.idToken(
      running.google,
      'web.apps.googleusercontent.com',
      'contract-link',
      'contract@example.com',
      linkNonce
    )
    await holds(signInRoutes.linkProvider, as.link(session, 'google', linking, linkNonce))
    await holds(
      signInRoutes.linkProvider,
      call('/v1/auth/link-social', {
        token: session,
        body: { provider: 'google', callbackURL: '/', errorCallbackURL: '/' }
      })
    )
    const identities = await call('/v1/auth/list-accounts', { token: session })
    await holds(signInRoutes.identities, Promise.resolve(identities))
    const linked = (identities.body as unknown as { id: string; providerId: string }[]).find(
      identity => identity.providerId === 'google'
    )
    await holds(
      signInRoutes.unlink,
      call('/v1/auth/unlink-account', { token: session, body: { accountId: linked?.id } })
    )
    const sessions = await call('/v1/auth/list-sessions', { token: session })
    await holds(signInRoutes.sessions, Promise.resolve(sessions))
    const other = sessionToken(await as.withCode('contract@example.com'))
    await holds(
      signInRoutes.revokeSession,
      call('/v1/auth/revoke-session', { token: session, body: { token: other.split('.')[0] } })
    )
    await holds(
      signInRoutes.revokeOtherSessions,
      call('/v1/auth/revoke-other-sessions', { token: session, body: {} })
    )
    await holds(signInRoutes.signOut, call('/v1/auth/sign-out', { token: session, body: {} }))
    const last = sessionToken(await as.withCode('contract@example.com'))
    await holds(
      signInRoutes.revokeSessions,
      call('/v1/auth/revoke-sessions', { token: last, body: {} })
    )
  })
})
