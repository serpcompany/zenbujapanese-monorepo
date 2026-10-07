import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { Accounts } from '../domain/accounts'
import type { Principal, Scope } from '../domain/clients'
import type { Change } from '../domain/entities'
import type { Profile } from '../domain/profile'
import type { MutationResult } from '../domain/sync'
import type { AccountEnv } from './env'
import { errorBody } from './errors'
import { requestsPerMinute } from './rate-limit'
import {
  ErrorSchema,
  ProfileConflictSchema,
  ProfilePatchSchema,
  ProfileSchema,
  SyncAnswerSchema,
  SyncRequestSchema
} from './schemas'

export const bodyLimitKb = 64

const security = [{ accessToken: [] }]

const json = <T>(schema: T, description: string) => ({
  content: { 'application/json': { schema } },
  description
})

const noScope = json(
  ErrorSchema,
  "`insufficient_scope`: this app's access to the account doesn't include `profile`."
)

const unauthorized = json(
  ErrorSchema,
  '`unauthorized`: no access token, or one that is expired, forged, or for an account that no longer exists. Get a new one from GET /v1/auth/token.'
)
const tooLarge = json(ErrorSchema, `\`too_large\`: the body is over ${bodyLimitKb} KB.`)
const malformed = json(ErrorSchema, '`bad_request`: the body is not JSON, or not this shape.')
const tooMany = (perMinute: number) =>
  json(
    ErrorSchema,
    `\`too_many_requests\`: this account sent more than ${perMinute} requests here in the current minute. Wait the seconds \`Retry-After\` says.`
  )
const failed = json(
  ErrorSchema,
  '`internal`: the service failed, and nothing says why. Try again later, backing off. In a sync, the mutations before the failure stand, and sending the request again answers them as before.'
)

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
  security,
  responses: {
    200: json(ProfileSchema, 'The profile.'),
    401: unauthorized,
    403: noScope,
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
  security,
  request: {
    body: { content: { 'application/json': { schema: ProfilePatchSchema } }, required: true }
  },
  responses: {
    200: json(ProfileSchema, 'The profile, as changed.'),
    400: json(ErrorSchema, '`bad_request`, or `invalid_fields`: a name or username out of bounds.'),
    401: unauthorized,
    403: noScope,
    409: json(
      z.union([ProfileConflictSchema, ErrorSchema]),
      '`version_conflict`, with `current`: the profile changed since `baseVersion`. `username_taken`: another account has that username.'
    ),
    413: tooLarge,
    429: tooMany(requestsPerMinute.profile),
    500: failed
  }
})

const sync = createRoute({
  method: 'post',
  path: '/v1/sync',
  summary: 'Send the changes made on the device, and get the changes made elsewhere',
  description:
    'Applies `mutations` in order, then answers with the changes after `cursor`. Every mutation is idempotent by its ID, so a request can be sent again after a lost answer. Each answer holds at most `limit` journal entries; while `hasMore` is true, sync again with the new cursor. Results and changes are bounded by the request limits.',
  security,
  request: {
    body: { content: { 'application/json': { schema: SyncRequestSchema } }, required: true }
  },
  responses: {
    200: json(SyncAnswerSchema, 'The results and the changes.'),
    400: malformed,
    401: unauthorized,
    410: json(
      ErrorSchema,
      "`invalid_cursor`: the cursor isn't one this service gave this account, or is past what it holds, as after a restore. Nothing was applied. Sync again with no cursor, and keep what comes back."
    ),
    413: tooLarge,
    429: tooMany(requestsPerMinute.sync),
    500: failed
  }
})

export function accountRoutes(
  app: OpenAPIHono<AccountEnv>,
  accounts: Accounts,
  databaseReady: () => Promise<boolean>
) {
  app.openAPIRegistry.registerComponent('securitySchemes', 'accessToken', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description:
      "A 15-minute access token from GET /v1/auth/token, which takes the session token a sign-in returns, never the session token itself. It names the account (`sub`), the app (`azp`), and the app's scopes (`scope`): `profile` for /v1/me, and for sync `lists:read`, `lists:write`, `known:read`, `known:write`, and `known:mark`, which marks a word Known but never clears one. The dictionary service takes `dictionary:read`."
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
