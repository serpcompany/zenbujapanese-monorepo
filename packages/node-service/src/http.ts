import { serve } from '@hono/node-server'
import type { MiddlewareHandler } from 'hono'
import { routePath } from 'hono/route'
import { errorFields, log } from './log'

export function logRequests(): MiddlewareHandler {
  return async (context, next) => {
    const started = performance.now()
    await next()
    log('info', 'request', {
      method: context.req.method,
      route: routePath(context),
      status: context.res.status,
      ms: Math.round(performance.now() - started)
    })
  }
}

export interface ServeOptions {
  fetch: Parameters<typeof serve>[0]['fetch']
  port: number
  hostname?: string
  listening: Record<string, unknown>
  close(): Promise<void>
}

export function serveUntilStopped({ fetch, port, hostname, listening, close }: ServeOptions): void {
  const server = serve({ fetch, port, hostname }, info =>
    log('info', 'listening', { address: info.address, port: info.port, ...listening })
  )
  let stopping = false
  const stop = (signal: string) => {
    if (stopping) return
    stopping = true
    log('info', 'stopping', { signal })
    server.close(() => void close().then(() => process.exit(0)))
  }
  process.on('SIGTERM', () => stop('SIGTERM'))
  process.on('SIGINT', () => stop('SIGINT'))
}

export function runService(main: () => Promise<void>): void {
  main().catch(error => {
    log('error', 'failed to start', errorFields(error))
    process.exit(1)
  })
}
