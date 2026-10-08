import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { DeleteAccount } from '../domain/account-deletion'
import type { Accounts } from '../domain/accounts'
import type { Principal, Scope } from '../domain/clients'
import type { Change } from '../domain/entities'
import type { Profile } from '../domain/profile'
import type { MutationResult } from '../domain/sync'
import type { AccountEnv } from './env'
import { errorBody } from './errors'
import { requestsPerMinute } from './rate-limit'
import { json, meaningsText, refusal, refusalSchema } from './refusals'
import {
  DeleteAccountSchema,
  ErrorSchema,
  ProfileConflictSchema,
  ProfilePatchSchema,
  ProfileSchema,
  SyncAnswerSchema,
  SyncRequestSchema
} from './schemas'
import { syncFieldSchemas } from './sync-entities'

export const bodyLimitKb = 64

const needs = (...scopes: Scope[]) => [{ accessToken: scopes }]

const noScope = (scope: Scope) => ({
  insufficient_scope: `This app's access to the account doesn't include \`${scope}\`.`
})

const unauthorized = refusal({
  unauthorized:
    'No access token, or one that is expired, forged, or for an account that no longer exists. Get a new one from GET /v1/auth/token.'
})
const tooLarge = refusal({ too_large: `The body is over ${bodyLimitKb} KB.` })
const malformed = { bad_request: 'The body is not JSON, or not this shape.' }
const tooMany = (perMinute: number) =>
  refusal({
    too_many_requests: `This account sent more than ${perMinute} requests here from this app in the current minute, or the app more than its limit from all its accounts together. Wait the seconds \`Retry-After\` says.`
  })
const failed = refusal({
  internal: 'The service failed, and nothing says why. Try again later, backing off.'
})
const failedSync = refusal({
  internal:
    'The service failed, and nothing says why. The mutations before the failure stand: send the same request again later, backing off, and those answer as before.'
})

const unauthorizedBody = errorBody(
  'unauthorized',
  'Send an access token from GET /v1/auth/token as `Authorization: Bearer <token>`.'
)

function refuse(context: Context) {
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

export function requireScope(scope: Scope) {
  return createMiddleware<AccountEnv>(async (context, next) => {
    if (context.get('scopes').has(scope)) return next()
    return context.json(
      errorBody('insufficient_scope', `This app's access to the account doesn't include ${scope}.`),
      403,
      { 'WWW-Authenticate': `Bearer error="insufficient_scope", scope="${scope}"` }
    )
  })
}

const profileJson = (profile: Profile) => ({
  ...profile,
  createdAt: profile.createdAt.toISOString(),
  updatedAt: profile.updatedAt.toISOString()
})

type Dated<T> = T extends null ? null : { [K in keyof T]: T[K] extends Date ? string : T[K] }
type ChangeJson<C> = C extends Change ? Omit<C, 'data'> & { data: Dated<C['data']> } : never

const datesIn = (data: object | null) =>
  data &&
  Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      value instanceof Date ? value.toISOString() : value
    ])
  )

const changeJson = (change: Change) =>
  ({ ...change, data: datesIn(change.data) }) as ChangeJson<Change>

const resultJson = (result: MutationResult) =>
  result.status === 'conflict' ? { ...result, current: changeJson(result.current) } : result

const usernameTaken = { username_taken: 'Another account has that username.' }

const health = createRoute({
  method: 'get',
  path: '/v1/health',
  summary: 'Whether the service can answer',
  responses: {
    200: json(z.object({ status: z.literal('ok') }), 'It can.'),
    503: json(z.object({ status: z.literal('unavailable') }), "Its database doesn't answer.")
  }
})

const readProfile = createRoute({
  method: 'get',
  path: '/v1/me',
  summary: "The signed-in account's profile",
  security: needs('profile'),
  responses: {
    200: json(ProfileSchema, 'The profile.'),
    401: unauthorized,
    403: refusal(noScope('profile')),
    429: tooMany(requestsPerMinute.profile),
    500: failed
  }
})

const changeProfile = createRoute({
  method: 'patch',
  path: '/v1/me',
  summary: "Change the signed-in account's name or username",
  description:
    'Optimistic concurrency: send the `version` last seen as `baseVersion`. The change goes through only if the profile is still at that version, and then its version goes up by one and it appears in /v1/sync. Sending the current values again changes nothing.',
  security: needs('profile'),
  request: {
    body: { content: { 'application/json': { schema: ProfilePatchSchema } }, required: true }
  },
  responses: {
    200: json(ProfileSchema, 'The profile, as changed.'),
    400: refusal({
      ...malformed,
      invalid_fields: 'A name or username out of bounds, or neither sent.'
    }),
    401: unauthorized,
    403: refusal(noScope('profile')),
    409: json(
      z.union([ProfileConflictSchema, refusalSchema(usernameTaken)]),
      meaningsText({
        version_conflict:
          'The profile changed since `baseVersion`, and nothing changed. `current` is the profile as it is now.',
        ...usernameTaken
      })
    ),
    413: tooLarge,
    429: tooMany(requestsPerMinute.profile),
    500: failed
  }
})

const deletionAnswers = {
  no_account: [401, 'unauthorized', 'Send an access token from GET /v1/auth/token.'],
  sign_in_again: [
    403,
    'sign_in_again',
    'Deleting the account needs a sign-in from the last 10 minutes. Sign in again first.'
  ],
  apple_authorization_needed: [
    400,
    'apple_authorization_needed',
    'This account signs in with Apple: send the authorization code from a fresh Sign in with Apple.'
  ],
  apple_authorization_invalid: [
    400,
    'apple_authorization_invalid',
    'Apple refused that authorization code. Sign in with Apple again for a new one.'
  ],
  apple_account_mismatch: [
    400,
    'apple_account_mismatch',
    "That Sign in with Apple is another Apple ID's. Sign in with the Apple ID this account uses."
  ],
  apple_unavailable: [
    503,
    'apple_unavailable',
    "Revoking with Apple didn't finish, and nothing was deleted. Sign in with Apple again for a new code, and try again."
  ]
} as const

const onTheWebsite = (uri: string, websiteOrigins: readonly string[]) =>
  websiteOrigins.includes(new URL(uri).origin)

const deletionRefusals = (status: number) =>
  Object.fromEntries(
    Object.values(deletionAnswers)
      .filter(([answered]) => answered === status)
      .map(([, code, message]) => [code, message])
  )

const removeAccount = createRoute({
  method: 'delete',
  path: '/v1/me',
  summary: 'Delete the signed-in account',
  description:
    "Deletes the account, its ways to sign in, its sessions, and everything it synced, at once; backups age out within 30 days, and the account's email is told. It needs `account:delete`, and a sign-in from the last 10 minutes, so the app asks the learner to sign in again first. An account that signs in with Apple sends a fresh Sign in with Apple authorization code from that sign-in, which the service uses to revoke the app's access with Apple. Each device keeps its own data and works signed out.",
  security: needs('account:delete'),
  request: {
    body: { content: { 'application/json': { schema: DeleteAccountSchema } }, required: true }
  },
  responses: {
    200: json(z.object({ status: z.literal('deleted') }), 'Deleted.'),
    400: refusal({
      bad_request:
        "The body is not JSON, or not this shape, or its `appleRedirectUri` is on none of the website's origins.",
      ...deletionRefusals(400)
    }),
    401: unauthorized,
    403: refusal({ ...noScope('account:delete'), ...deletionRefusals(403) }),
    413: tooLarge,
    429: tooMany(requestsPerMinute.profile),
    500: failed,
    503: refusal(deletionRefusals(503))
  }
})

const sync = createRoute({
  method: 'post',
  path: '/v1/sync',
  summary: 'Send the changes made on the device, and get the changes made elsewhere',
  description:
    'Applies `mutations` in order, then answers with the changes after `cursor`. Every mutation is idempotent by its ID, so a request can be sent again after a lost answer. Each answer holds at most `limit` journal entries; while `hasMore` is true, sync again with the new cursor. Results and changes are bounded by the request limits.',
  security: needs(),
  request: {
    body: { content: { 'application/json': { schema: SyncRequestSchema } }, required: true }
  },
  responses: {
    200: json(SyncAnswerSchema, 'The results and the changes.'),
    400: refusal(malformed),
    401: unauthorized,
    410: refusal({
      invalid_cursor:
        "The cursor isn't one this service gave this account, or is past what it holds, as after a restore. Nothing was applied. Sync again with no cursor, and keep what comes back."
    }),
    413: tooLarge,
    429: tooMany(requestsPerMinute.sync),
    500: failedSync
  }
})

export function accountRoutes(
  app: OpenAPIHono<AccountEnv>,
  accounts: Accounts,
  deleteAccount: DeleteAccount,
  databaseReady: () => Promise<boolean>,
  websiteOrigins: readonly string[]
) {
  app.openAPIRegistry.register('Error', ErrorSchema)
  for (const [name, schema] of syncFieldSchemas) app.openAPIRegistry.register(name, schema)
  app.openAPIRegistry.registerComponent('securitySchemes', 'accessToken', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description:
      "A 15-minute access token from GET /v1/auth/token, which takes the session token a sign-in returns, never the session token itself. It names the account (`sub`), the app (`azp`), when the learner signed in (`auth_time`), and the app's scopes (`scope`, space-separated). Each route names the scope it needs, and each sync operation its own, in `x-sync-entities`. The dictionary service's routes for apps take `dictionary:read`."
  })

  app.openapi(health, async context =>
    (await databaseReady())
      ? context.json({ status: 'ok' as const }, 200)
      : context.json({ status: 'unavailable' as const }, 503)
  )

  app.openapi(readProfile, async context => {
    const profile = await accounts.profile(context.get('userId'))
    return profile ? context.json(profileJson(profile), 200) : refuse(context)
  })

  app.openapi(changeProfile, async context => {
    const { baseVersion, ...fields } = context.req.valid('json')
    const update = await accounts.updateProfile(context.get('userId'), baseVersion, fields)
    if (!update) return refuse(context)
    if (update.status === 'conflict') {
      return context.json(
        {
          ...errorBody(
            'version_conflict',
            'The profile changed since baseVersion. Nothing was changed.'
          ),
          current: profileJson(update.profile)
        },
        409
      )
    }
    if (update.status === 'rejected') {
      const { code, message } = update.rejection
      return context.json(errorBody(code, message), code === 'username_taken' ? 409 : 400)
    }
    return context.json(profileJson(update.profile), 200)
  })

  app.openapi(removeAccount, async context => {
    const { appleAuthorizationCode, appleRedirectUri } = context.req.valid('json')
    if (appleRedirectUri !== undefined && !onTheWebsite(appleRedirectUri, websiteOrigins)) {
      return context.json(
        errorBody('bad_request', "appleRedirectUri must be on one of the website's origins."),
        400
      )
    }
    const deletion = await deleteAccount(
      {
        userId: context.get('userId'),
        clientId: context.get('clientId'),
        scopes: context.get('scopes'),
        signedInAt: context.get('signedInAt')
      },
      { code: appleAuthorizationCode, redirectUri: appleRedirectUri }
    )
    if (deletion === 'deleted') return context.json({ status: 'deleted' as const }, 200)
    const [status, code, message] = deletionAnswers[deletion]
    return context.json(errorBody(code, message), status)
  })

  app.openapi(sync, async context => {
    const answer = await accounts.sync(
      context.get('userId'),
      context.req.valid('json'),
      context.get('scopes')
    )
    if (answer.status === 'no_account') return refuse(context)
    if (answer.status === 'invalid_cursor') {
      return context.json(
        errorBody('invalid_cursor', 'Sync again with no cursor. Nothing was applied.'),
        410
      )
    }
    return context.json(
      {
        results: answer.results.map(resultJson),
        changes: answer.changes.map(changeJson),
        cursor: answer.cursor,
        hasMore: answer.hasMore
      },
      200
    )
  })
}
