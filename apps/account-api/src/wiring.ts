import { log } from '@zenbu/node-service/log'
import { accessTokenVerifier } from './auth/access-tokens'
import { appleRevoker } from './auth/apple-revoke'
import type { createAuth } from './auth/auth'
import type { AuthConfig } from './config'
import { accountStore } from './db/accounts'
import type { Drizzle } from './db/database'
import { purgeExpired } from './db/housekeeping'
import { accountDeleter } from './domain/account-deletion'
import { createAccounts } from './domain/accounts'
import { cursorKey, cursors, searchKeys } from './domain/cursor'
import { type PhotoStorage, photoFiles } from './domain/photo-files'
import { accountDeletedMessage } from './email/account-notices'
import type { DevMailbox } from './email/mailbox'
import type { Mailer } from './email/mailer'
import { failureFields } from './failure'
import { createApp } from './http/app'

interface ServiceParts {
  release: string
  db: Drizzle
  databaseReady(): Promise<boolean>
  auth: Awaited<ReturnType<typeof createAuth>>
  authConfig: AuthConfig
  mailer: Mailer
  devMailbox: DevMailbox | null
  photoStorage: PhotoStorage | null
}

export function wiredService(parts: ServiceParts) {
  const { auth, authConfig, mailer } = parts
  const store = accountStore(parts.db)
  const files = photoFiles(store, parts.photoStorage)
  const sweep = () =>
    files
      .sweep()
      .catch(error => log('warn', 'deleting removed photos failed', failureFields(error)))
  const sweepSoon = () => void sweep()
  const app = createApp({
    release: parts.release,
    databaseReady: parts.databaseReady,
    auth,
    accounts: createAccounts(
      store,
      cursors(cursorKey(authConfig.secret)),
      searchKeys(authConfig.secret),
      sweepSoon
    ),
    deleteAccount: accountDeleter(
      store,
      appleRevoker(authConfig.apple, authConfig.publicUrl),
      {
        accountDeleted: (email, language) =>
          void mailer.send(accountDeletedMessage(email, language))
      },
      sweepSoon
    ),
    photoFiles: files,
    verifyAccessToken: accessTokenVerifier(() => auth.api.getJwks(), authConfig.publicUrl),
    allowedOrigins: authConfig.trustedOrigins,
    devMailbox: parts.devMailbox
  })
  return {
    app,
    files,
    async housekeep() {
      await purgeExpired(parts.db).catch(error =>
        log('warn', 'housekeeping failed', failureFields(error))
      )
      await sweep()
    }
  }
}
