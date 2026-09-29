// A worker thread: loads the dictionary, then answers the pool's calls one at a time. SQLite is
// synchronous, so a slow query (the broadest searches take seconds) holds only its own thread.

import { parentPort, workerData } from 'node:worker_threads'
import { loadService, type VerifiedFiles } from './load'
import { errorFields, log } from './log'
import type { ServiceMethod } from './service'

export interface Call {
  id: number
  method: ServiceMethod
  args: unknown[]
}

export type Reply = { id: number; result: unknown } | { id: number; error: string }

const port = parentPort
if (!port) throw new Error('worker.ts runs as a worker thread')

const started = performance.now()
const { service } = loadService(workerData as VerifiedFiles)
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
