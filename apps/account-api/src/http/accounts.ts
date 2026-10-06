import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { Accounts } from '../domain/accounts'
import type { Profile } from '../domain/profile'
import type { Change, MutationResult } from '../domain/sync'
import { errorBody } from './errors'
import {
  ErrorSchema,
  ProfileConflictSchema,
  ProfilePatchSchema,
  ProfileSchema,
  SyncAnswerSchema,
  SyncRequestSchema
} from './schemas'

export type AccountEnv = { Variables: { userId: string } }

export const bodyLimitKb = 64

const security = [{ accessToken: [] }]

const json = <T>(schema: T, description: string) => ({
  content: { 'application/json': { schema } },
  description
})

const unauthorized = json(
  ErrorSchema,
  '`unauthorized`: no access token, or one that is expired, forged, or for an account that no longer exists. Get a new one from GET /v1/auth/token.'
)
const tooLarge = json(ErrorSchema, `\`too_large\`: the body is over ${bodyLimitKb} KB.`)
const malformed = json(ErrorSchema, '`bad_request`: the body is not JSON, or not this shape.')
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

export function requireAccount(verifyAccessToken: (token: string) => Promise<string | null>) {
  return createMiddleware<AccountEnv>(async (context, next) => {
    const token = /^bearer\s+(\S+)$/i.exec(context.req.header('authorization') ?? '')?.[1]
    const userId = token ? await verifyAccessToken(token) : null
    if (!userId) return refuse(context)
    context.set('userId', userId)
    await next()
  })
}

const profileJson = (profile: Profile) => ({
  ...profile,
  createdAt: profile.createdAt.toISOString(),
  updatedAt: profile.updatedAt.toISOString()
})

const resultJson = (result: MutationResult) =>
  result.status === 'conflict' ? { ...result, current: profileJson(result.current) } : result

const changeJson = (change: Change) => ({ ...change, data: profileJson(change.data) })

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
  responses: { 200: json(ProfileSchema, 'The profile.'), 401: unauthorized, 500: failed }
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
    409: json(
      z.union([ProfileConflictSchema, ErrorSchema]),
      '`version_conflict`, with `current`: the profile changed since `baseVersion`. `username_taken`: another account has that username.'
    ),
    413: tooLarge,
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
      'A 15-minute access token from GET /v1/auth/token, which takes the session token a sign-in returns. Never the session token itself.'
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
    const answer = await accounts.sync(context.get('userId'), context.req.valid('json'))
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
