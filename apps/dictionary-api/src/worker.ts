import { parentPort, workerData } from 'node:worker_threads'
import { errorFields, log } from '@zenbu/node-service/log'
import { loadService, type VerifiedFiles } from './load'
import type { ServiceInfo, ServiceMethod } from './service'

export interface Call {
  id: number
  method: ServiceMethod
  args: unknown[]
}

export type Reply = { id: number; result: unknown; ms: number } | { id: number; error: string }

export interface Ready {
  ready: true
  info: ServiceInfo
}

const port = parentPort
if (!port) throw new Error('worker.ts runs as a worker thread')
const files = workerData as VerifiedFiles

serve(port)

function serve(port: NonNullable<typeof parentPort>) {
  const started = performance.now()
  const { service, info } = loadService(files)
  log('info', 'worker ready', { ms: Math.round(performance.now() - started) })
  port.postMessage({ ready: true, info } satisfies Ready)

  port.on('message', async ({ id, method, args }: Call) => {
    const begun = performance.now()
    try {
      const call = service[method] as (...parameters: unknown[]) => Promise<unknown>
      const result = await call(...args)
      port.postMessage({ id, result, ms: performance.now() - begun } satisfies Reply)
    } catch (error) {
      log('error', 'call failed', { method, ...errorFields(error) })
      port.postMessage({
        id,
        error: error instanceof Error ? error.message : String(error)
      } satisfies Reply)
    }
  })
}
