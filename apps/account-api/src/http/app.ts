import { OpenAPIHono } from '@hono/zod-openapi'
import { logRequests } from '@zenbu/node-service/http'
import { log } from '@zenbu/node-service/log'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { routePath } from 'hono/route'
import type { DeleteAccount } from '../domain/account-deletion'
import type { Accounts } from '../domain/accounts'
import { clientById, type Principal } from '../domain/clients'
import type { Billing } from '../domain/subscription-billing'
import { failureFields } from '../failure'
import { accountRoutes } from './accounts'
import type { AccountEnv } from './env'
import { errorBody, errorCode, inErrorFormat } from './errors'
import { type PhotoRoutesFiles, photoBodyLimit, photoRoutes } from './photos'
import {
  atMostAtOnce,
  atOnce,
  perAccountLimit,
  perClientLimit,
  requestsPerMinute
} from './rate-limit'
import { bodyLimitKb, requireAccount, requireScope } from './route-answers'
import { signInContract } from './sign-in-contract'
import {
  cloudDataPaths,
  requireCloudAccess,
  subscriptionPath,
  subscriptionRoutes
} from './subscription'
import { webhookRoutes } from './webhooks'

interface AuthHandler {
  handler(request: Request): Promise<Response>
}

interface Mailbox {
  messages(): readonly { to: string; subject: string; text: string; at: string }[]
}

export interface AppOptions {
  release: string
  databaseReady(): Promise<boolean>
  auth: AuthHandler
  accounts: Accounts
  deleteAccount: DeleteAccount
  billing: Billing
  photoFiles: PhotoRoutesFiles
  verifyAccessToken(token: string): Promise<Principal | null>
  allowedOrigins: readonly string[]
  devMailbox: Mailbox | null
}

const localHosts = new Set(['localhost', '127.0.0.1', '[::1]'])

function isLocal(url: string): boolean {
  return localHosts.has(new URL(url).hostname)
}

const subscriptionPaths = [subscriptionPath, `${subscriptionPath}/*`] as const
const accountPaths = ['/v1/me', '/v1/sync', '/v1/photos/*', ...subscriptionPaths] as const

function forTheWebsite(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.delete('set-auth-token')
  if (response.status >= 400) headers.delete('set-cookie')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}

export function createApp(options: AppOptions) {
  const { release, databaseReady, auth, devMailbox } = options
  const app = new OpenAPIHono<AccountEnv>({
    defaultHook: (result, context) => {
      if (result.success) return
      const problems = result.error.issues.map(
        issue => `${issue.path.join('.') || 'body'}: ${issue.message}`
      )
      return context.json(errorBody('bad_request', problems.join('; ')), 400)
    }
  })

  app.use(logRequests())
  const crossOrigin = cors({
    origin: origin => (options.allowedOrigins.includes(origin) ? origin : null),
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowHeaders: ['authorization', 'content-type', 'x-zenbu-client'],
    exposeHeaders: ['retry-after', 'x-retry-after'],
    maxAge: 600
  })
  for (const path of ['/v1/auth/*', '/v1/health', ...accountPaths]) app.use(path, crossOrigin)
  const appLimit = perClientLimit(id => clientById(id)?.requestsPerMinute ?? 0)
  for (const path of accountPaths) {
    app.use(path, requireAccount(options.verifyAccessToken))
    app.use(path, appLimit)
  }
  app.on(['GET', 'PATCH'], '/v1/me', requireScope('profile'))
  app.delete('/v1/me', requireScope('account:delete'))
  app.use('/v1/me', perAccountLimit(requestsPerMinute.profile))
  app.use('/v1/sync', perAccountLimit(requestsPerMinute.sync))
  const subscriptionLimit = perAccountLimit(requestsPerMinute.subscription)
  for (const path of subscriptionPaths) {
    app.use(path, requireScope('subscription'))
    app.use(path, subscriptionLimit)
  }
  app.put('/v1/photos/*', requireScope('photos:write', 'profile'))
  app.get('/v1/photos/*', requireScope('photos:read', 'profile'))
  app.use('/v1/photos/*', perAccountLimit(requestsPerMinute.photos))
  for (const path of cloudDataPaths) app.use(path, requireCloudAccess(options.billing))
  app.put('/v1/photos/*', atMostAtOnce(atOnce.uploads))
  app.get('/v1/photos/*', atMostAtOnce(atOnce.downloads, true))
  const limitedBody = bodyLimit({
    maxSize: bodyLimitKb * 1024,
    onError: context =>
      context.json(errorBody('too_large', `The body is over ${bodyLimitKb} KB.`), 413)
  })
  for (const path of ['/v1/auth/*', '/v1/me', '/v1/sync', ...subscriptionPaths]) {
    app.use(path, limitedBody)
  }
  app.use(
    '/v1/photos/*',
    bodyLimit({
      maxSize: photoBodyLimit,
      onError: context =>
        context.json(errorBody('too_large', 'The photo is over its size limit.'), 413)
    })
  )

  app.get('/healthz', async context =>
    (await databaseReady())
      ? context.json({ status: 'ok', release })
      : context.json({ status: 'unavailable', release }, 503)
  )

  accountRoutes(app, options.accounts, options.deleteAccount, databaseReady, options.allowedOrigins)
  subscriptionRoutes(app, options.billing, options.allowedOrigins)
  webhookRoutes(app, options.billing)
  photoRoutes(app, options.photoFiles)
  signInContract(app)

  app.on(['GET', 'POST'], '/v1/auth/*', async context => {
    const answer = await inErrorFormat(await auth.handler(context.req.raw))
    const origin = context.req.header('origin')
    return origin && options.allowedOrigins.includes(origin) ? forTheWebsite(answer) : answer
  })

  app.get('/dev/mail', context => {
    if (devMailbox === null || !isLocal(context.req.url)) return context.notFound()
    return context.json({ messages: devMailbox.messages() })
  })

  app.notFound(context => context.json(errorBody('not_found', 'There is nothing here.'), 404))

  app.onError((error, context) => {
    if (error instanceof HTTPException) {
      return context.json(errorBody(errorCode(error.status), error.message), error.status)
    }
    log('error', 'request failed', { route: routePath(context), ...failureFields(error) })
    return context.json(errorBody('internal', 'Something went wrong. Try again later.'), 500)
  })

  return app
}
