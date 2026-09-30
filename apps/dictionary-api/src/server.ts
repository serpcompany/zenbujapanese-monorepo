// The service's entry point: checks the files, starts the worker threads, and serves HTTP. It
// answers /healthz with 503 until every thread has loaded, and stops cleanly on SIGTERM.

import { serve } from '@hono/node-server'
import type { ConjugationSitemapWord } from '@zenbu/dictionary-core/artifact/conjugation-sitemap'
import { createApp } from './app'
import { readConfig } from './config'
import { verifyFiles } from './load'
import { errorFields, log } from './log'
import { computeConjugationSitemap, createPool } from './pool'

async function main() {
  const config = readConfig()
  const started = performance.now()
  const files = await verifyFiles(config)
  log('info', 'files checked', {
    ms: Math.round(performance.now() - started),
    artifact: files.artifactSha256,
    sentenceSearch: files.sudachiDictionary !== null
  })
  const pool = createPool(files, config.workers)
  let conjugationSitemap: ConjugationSitemapWord[] | null = null
  const app = createApp({
    service: pool,
    token: config.token,
    ready: () => pool.readyCount() === config.workers,
    conjugationSitemap: () => conjugationSitemap
  })
  const server = serve({ fetch: app.fetch, port: config.port }, ({ port }) =>
    log('info', 'listening', { port, workers: config.workers, release: config.release })
  )
  pool.ready.then(
    () => {
      log('info', 'ready', { ms: Math.round(performance.now() - started) })
      // Once the answering threads are up, work out the conjugations sitemap in a thread of its
      // own; its route answers 503 until then. A failure is retried, a minute later.
      const compute = (attempt: number) =>
        computeConjugationSitemap(files).then(
          sitemap => {
            conjugationSitemap = sitemap
          },
          error => {
            log('error', 'the conjugations sitemap failed', { attempt, ...errorFields(error) })
            if (attempt < 3) setTimeout(() => compute(attempt + 1), 60_000).unref()
          }
        )
      compute(1)
    },
    error => {
      log('error', 'a worker failed to load', errorFields(error))
      process.exit(1)
    }
  )
  const stop = (signal: string) => {
    log('info', 'stopping', { signal })
    server.close(() => void pool.close().then(() => process.exit(0)))
  }
  process.on('SIGTERM', () => stop('SIGTERM'))
  process.on('SIGINT', () => stop('SIGINT'))
}

main().catch(error => {
  log('error', 'failed to start', errorFields(error))
  process.exit(1)
})
