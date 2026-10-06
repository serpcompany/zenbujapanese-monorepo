import { logRequests } from '@zenbu/node-service/http'
import { errorFields, log } from '@zenbu/node-service/log'
import { Hono } from 'hono'
import { routePath } from 'hono/route'
import { errorBody } from './errors'

export interface AppOptions {
  release: string
  databaseReady(): Promise<boolean>
}

export function createApp({ release, databaseReady }: AppOptions) {
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

  app.notFound(context => context.json(errorBody('not_found', 'There is nothing here.'), 404))

  app.onError((error, context) => {
    log('error', 'request failed', { route: routePath(context), ...errorFields(error) })
    return context.json(errorBody('internal', 'Something went wrong. Try again later.'), 500)
  })

  return app
}
