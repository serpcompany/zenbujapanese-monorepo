import { join } from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'
import { conjugationSitemap } from '@zenbu/dictionary-core/artifact/conjugation-sitemap'
import { openArtifact } from './artifact'
import { loadKuromoji } from './kuromoji'
import { loadService, type VerifiedFiles } from './load'
import { errorFields, log } from './log'
import type { ServiceMethod } from './service'

export interface Call {
  id: number
  method: ServiceMethod
  args: unknown[]
}

export type Reply = { id: number; result: unknown } | { id: number; error: string }

export type SitemapReply = { sitemap: ReturnType<typeof conjugationSitemap> }

const port = parentPort
if (!port) throw new Error('worker.ts runs as a worker thread')
const files = workerData as VerifiedFiles & { task?: 'conjugation-sitemap' }

if (files.task === 'conjugation-sitemap') {
  const started = performance.now()
  const artifact = openArtifact(files.resources, files.artifactSha256)
  const sitemap = conjugationSitemap(artifact.db, loadKuromoji(join(files.resources, 'Kuromoji')))
  artifact.close()
  log('info', 'conjugations sitemap ready', {
    ms: Math.round(performance.now() - started),
    words: sitemap.length,
    forms: sitemap.reduce((sum, word) => sum + word.forms.length, 0)
  })
  port.postMessage({ sitemap } satisfies SitemapReply)
} else {
  serve(port)
}

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
