import { runService, serveUntilStopped } from '@zenbu/node-service/http'
import { log } from '@zenbu/node-service/log'
import { accessTokenVerifier } from './auth/access-tokens'
import { appleRevoker } from './auth/apple-revoke'
import { createAuth } from './auth/auth'
import { readConfig } from './config'
import { accountStore } from './db/accounts'
import { purgeExpired } from './db/housekeeping'
import { migratePostgres, openPostgres } from './db/postgres'
import { accountDeleter } from './domain/account-deletion'
import { createAccounts } from './domain/accounts'
import { cursorKey, cursors } from './domain/cursor'
import { accountDeletedMessage } from './email/account-notices'
import { DevMailbox } from './email/mailbox'
import { createMailer } from './email/mailer'
import { failureFields } from './failure'
import { createApp } from './http/app'

const purgeEveryMs = 60 * 60 * 1000

async function main() {
  const config = readConfig()
  const started = performance.now()
  await migratePostgres(config.databaseUrl, config.migrations)
  log('info', 'migrated', { ms: Math.round(performance.now() - started) })
  const database = openPostgres(config.databaseUrl)
  const purge = () =>
    purgeExpired(database.db).catch(error =>
      log('warn', 'purging expired sign-in rows failed', failureFields(error))
    )
  void purge()
  setInterval(purge, purgeEveryMs).unref()
  const devMailbox = config.email.provider?.kind === 'dev-mailbox' ? new DevMailbox() : null
  const mailer = createMailer(config.email, devMailbox)
  const auth = await createAuth({ config: config.auth, db: database.db, mailer })
  const store = accountStore(database.db)
  const app = createApp({
    release: config.release,
    databaseReady: database.ready,
    auth,
    accounts: createAccounts(store, cursors(cursorKey(config.auth.secret))),
    deleteAccount: accountDeleter(store, appleRevoker(config.auth.apple, config.auth.publicUrl), {
      accountDeleted: email => void mailer.send(accountDeletedMessage(email))
    }),
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
      }
    },
    close: () => database.close()
  })
}

runService(main)
