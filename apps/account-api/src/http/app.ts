import { OpenAPIHono } from '@hono/zod-openapi'
import { logRequests } from '@zenbu/node-service/http'
import { log } from '@zenbu/node-service/log'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { routePath } from 'hono/route'
import type { Accounts } from '../domain/accounts'
import { failureFields } from '../failure'
import { type AccountEnv, accountRoutes, bodyLimitKb, requireAccount } from './accounts'
import { errorBody, errorCode, inErrorFormat } from './errors'

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
  verifyAccessToken(token: string): Promise<string | null>
  allowedOrigins: readonly string[]
  devMailbox: Mailbox | null
}

const localHosts = new Set(['localhost', '127.0.0.1', '[::1]'])

function isLocal(url: string): boolean {
  return localHosts.has(new URL(url).hostname)
}

const accountPaths = ['/v1/me', '/v1/sync'] as const

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
    allowMethods: ['GET', 'POST', 'PATCH'],
    allowHeaders: ['authorization', 'content-type'],
    exposeHeaders: ['set-auth-token'],
    maxAge: 600
  })
  for (const path of ['/v1/auth/*', '/v1/health', ...accountPaths]) app.use(path, crossOrigin)
  for (const path of accountPaths) {
    app.use(path, requireAccount(options.verifyAccessToken))
    app.use(
      path,
      bodyLimit({
        maxSize: bodyLimitKb * 1024,
        onError: context =>
          context.json(errorBody('too_large', `The body is over ${bodyLimitKb} KB.`), 413)
      })
    )
  }

  app.get('/healthz', async context =>
    (await databaseReady())
      ? context.json({ status: 'ok', release })
      : context.json({ status: 'unavailable', release }, 503)
  )

  accountRoutes(app, options.accounts, databaseReady)

  app.on(['GET', 'POST'], '/v1/auth/*', async context =>
    inErrorFormat(await auth.handler(context.req.raw))
  )

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
