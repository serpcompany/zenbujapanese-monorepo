import { runService, serveUntilStopped } from '@zenbu/node-service/http'
import { log } from '@zenbu/node-service/log'
import { accessTokenVerifier } from './auth/access-tokens'
import { appleRevoker } from './auth/apple-revoke'
import { createAuth } from './auth/auth'
import { type PhotoStore, readConfig } from './config'
import { accountStore } from './db/accounts'
import { purgeExpired } from './db/housekeeping'
import { migratePostgres, openPostgres } from './db/postgres'
import { accountDeleter } from './domain/account-deletion'
import { createAccounts } from './domain/accounts'
import { cursorKey, cursors, searchKeys } from './domain/cursor'
import { type PhotoStorage, photoFiles } from './domain/photo-files'
import { accountDeletedMessage } from './email/account-notices'
import { DevMailbox } from './email/mailbox'
import { createMailer } from './email/mailer'
import { failureFields } from './failure'
import { createApp } from './http/app'
import { MemoryPhotoStorage } from './storage/memory'
import { r2Storage } from './storage/r2'

const purgeEveryMs = 60 * 60 * 1000

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
  const store = accountStore(database.db)
  const files = photoFiles(store, photoStorage(config.photos))
  const sweepPhotos = () =>
    void files
      .sweep()
      .catch(error => log('warn', 'deleting removed photos failed', failureFields(error)))
  const purge = () =>
    purgeExpired(database.db)
      .catch(error => log('warn', 'housekeeping failed', failureFields(error)))
      .then(sweepPhotos)
  void purge()
  setInterval(purge, purgeEveryMs).unref()
  const devMailbox = config.email.provider?.kind === 'dev-mailbox' ? new DevMailbox() : null
  const mailer = createMailer(config.email, devMailbox)
  const auth = await createAuth({ config: config.auth, db: database.db, mailer })
  const app = createApp({
    release: config.release,
    databaseReady: database.ready,
    auth,
    accounts: createAccounts(
      store,
      cursors(cursorKey(config.auth.secret)),
      searchKeys(config.auth.secret),
      sweepPhotos
    ),
    deleteAccount: accountDeleter(
      store,
      appleRevoker(config.auth.apple, config.auth.publicUrl),
      {
        accountDeleted: (email, language) =>
          void mailer.send(accountDeletedMessage(email, language))
      },
      sweepPhotos
    ),
    photoFiles: files,
    verifyAccessToken: accessTokenVerifier(() => auth.api.getJwks(), config.auth.publicUrl),
    allowedOrigins: config.auth.trustedOrigins,
    devMailbox
  })
  serveUntilStopped({
    fetch: app.fetch,
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
