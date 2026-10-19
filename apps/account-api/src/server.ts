import { runService, serveUntilStopped } from '@zenbu/node-service/http'
import { log } from '@zenbu/node-service/log'
import { createAuth } from './auth/auth'
import { type PhotoStore, readConfig } from './config'
import { migratePostgres, openPostgres } from './db/postgres'
import type { PhotoStorage } from './domain/photo-files'
import { DevMailbox } from './email/mailbox'
import { createMailer } from './email/mailer'
import { MemoryPhotoStorage } from './storage/memory'
import { r2Storage } from './storage/r2'
import { wiredService } from './wiring'

const housekeepingEveryMs = 60 * 60 * 1000

function photoStorage(store: PhotoStore | null): PhotoStorage | null {
  if (store?.kind === 'r2') return r2Storage(store.r2)
  return store?.kind === 'dev-memory' ? new MemoryPhotoStorage() : null
}

async function main() {
  const config = readConfig()
  const started = performance.now()
  await migratePostgres(config.databaseUrl, config.migrations)
  log('info', 'migrated', { ms: Math.round(performance.now() - started) })
  const database = openPostgres(config.databaseUrl)
  const devMailbox = config.email.provider?.kind === 'dev-mailbox' ? new DevMailbox() : null
  const mailer = createMailer(config.email, devMailbox)
  const auth = await createAuth({ config: config.auth, db: database.db, mailer })
  const service = wiredService({
    release: config.release,
    db: database.db,
    databaseReady: database.ready,
    auth,
    authConfig: config.auth,
    mailer,
    devMailbox,
    photoStorage: photoStorage(config.photos)
  })
  void service.housekeep()
  setInterval(() => void service.housekeep(), housekeepingEveryMs).unref()
  serveUntilStopped({
    fetch: service.app.fetch,
    port: config.port,
    hostname: devMailbox ? '127.0.0.1' : undefined,
    listening: {
      release: config.release,
      signIn: {
        apple: config.auth.apple !== null,
        google: config.auth.google !== null,
        email: config.email.provider?.kind ?? 'off'
      },
      photos: config.photos?.kind ?? 'off'
    },
    close: () => database.close()
  })
}

runService(main)
