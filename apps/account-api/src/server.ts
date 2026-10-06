import { runService, serveUntilStopped } from '@zenbu/node-service/http'
import { log } from '@zenbu/node-service/log'
import { readConfig } from './config'
import { migratePostgres, openPostgres } from './db/postgres'
import { createApp } from './http/app'

async function main() {
  const config = readConfig()
  const started = performance.now()
  await migratePostgres(config.databaseUrl, config.migrations)
  log('info', 'migrated', { ms: Math.round(performance.now() - started) })
  const database = openPostgres(config.databaseUrl)
  const app = createApp({ release: config.release, databaseReady: database.ready })
  serveUntilStopped({
    fetch: app.fetch,
    port: config.port,
    listening: { release: config.release },
    close: () => database.close()
  })
}

runService(main)
