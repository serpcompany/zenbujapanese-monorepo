import { runService, serveUntilStopped } from '@zenbu/node-service/http'
import { errorFields, log } from '@zenbu/node-service/log'
import { accountTokens } from './account-tokens'
import { createApp } from './app'
import { readConfig } from './config'
import { verifyFiles } from './load'
import { createPool } from './pool'
import { perMinute } from './rate-limit'

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
  const app = createApp({
    service: pool,
    token: config.token,
    ready: () => pool.readyCount() === config.workers,
    access: config.apps && {
      tokens: accountTokens(config.apps),
      limit: perMinute(config.apps.requestsPerMinute)
    }
  })
  serveUntilStopped({
    fetch: app.fetch,
    port: config.port,
    listening: { workers: config.workers, release: config.release },
    close: () => pool.close()
  })
  pool.ready.then(
    () => log('info', 'ready', { ms: Math.round(performance.now() - started) }),
    error => {
      log('error', 'a worker failed to load', errorFields(error))
      process.exit(1)
    }
  )
}

runService(main)
