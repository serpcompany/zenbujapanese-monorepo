import { parentPort, workerData } from 'node:worker_threads'
import { errorFields, log } from '@zenbu/node-service/log'
import { loadService, type VerifiedFiles } from './load'
import type { ServiceMethod } from './service'

export interface Call {
  id: number
  method: ServiceMethod
  args: unknown[]
}

export type Reply = { id: number; result: unknown } | { id: number; error: string }

const port = parentPort
if (!port) throw new Error('worker.ts runs as a worker thread')
const files = workerData as VerifiedFiles

serve(port)

function serve(port: NonNullable<typeof parentPort>) {
  const started = performance.now()
  const { service } = loadService(files)
  log('info', 'worker ready', { ms: Math.round(performance.now() - started) })
  port.postMessage({ ready: true })

  port.on('message', async ({ id, method, args }: Call) => {
    try {
      const call = service[method] as (...parameters: unknown[]) => Promise<unknown>
      port.postMessage({ id, result: await call(...args) } satisfies Reply)
    } catch (error) {
      log('error', 'call failed', { method, ...errorFields(error) })
      port.postMessage({
        id,
        error: error instanceof Error ? error.message : String(error)
      } satisfies Reply)
    }
  })
}
