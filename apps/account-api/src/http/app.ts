import { logRequests } from '@zenbu/node-service/http'
import { log } from '@zenbu/node-service/log'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { routePath } from 'hono/route'
import { failureFields } from '../failure'
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
  emailSignIn: boolean
  devMailbox: Mailbox | null
}

const localHosts = new Set(['localhost', '127.0.0.1', '[::1]'])

function isLocal(url: string): boolean {
  return localHosts.has(new URL(url).hostname)
}

export function createApp({ release, databaseReady, auth, emailSignIn, devMailbox }: AppOptions) {
  const app = new Hono()

  app.use(logRequests())

  app.get('/healthz', async context =>
    (await databaseReady())
      ? context.json({ status: 'ok', release })
      : context.json({ status: 'unavailable', release }, 503)
  )

  app.get('/v1/health', async context =>
    (await databaseReady())
      ? context.json({ status: 'ok' })
      : context.json({ status: 'unavailable' }, 503)
  )

  app.post('/v1/auth/email-otp/send-verification-otp', async (context, next) => {
    if (emailSignIn) return next()
    return context.json(
      errorBody('email_unavailable', 'Signing in with an email code is not available right now.'),
      503
    )
  })

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
