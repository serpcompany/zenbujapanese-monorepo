import { runService, serveUntilStopped } from '@zenbu/node-service/http'
import { log } from '@zenbu/node-service/log'
import { createAuth } from './auth/auth'
import { appStoreBilling } from './billing/app-store'
import { storeTraits } from './billing/stores'
import { stripeBilling, stripeMode } from './billing/stripe'
import type { BillingConfig } from './billing-config'
import { type PhotoStore, readConfig } from './config'
import { billingStore } from './db/billing'
import { migratePostgres, openPostgres } from './db/postgres'
import { appSellingTheSubscription, clientById } from './domain/clients'
import type { PhotoStorage } from './domain/photo-files'
import { type Billing, createBilling } from './domain/subscription-billing'
import { DevMailbox } from './email/mailbox'
import { createMailer } from './email/mailer'
import { failureFields } from './failure'
import { MemoryPhotoStorage } from './storage/memory'
import { r2Storage } from './storage/r2'
import { wiredService } from './wiring'

const housekeepingEveryMs = 60 * 60 * 1000

const settleEveryMs = 60 * 1000

function photoStorage(store: PhotoStore | null): PhotoStorage | null {
  if (store?.kind === 'r2') return r2Storage(store.r2)
  return store?.kind === 'dev-memory' ? new MemoryPhotoStorage() : null
}

function billingProviders({ stripe, appStore }: BillingConfig) {
  const bundleId = clientById(appSellingTheSubscription)?.appleBundleIds[0]
  if (appStore && !bundleId) {
    throw new Error(`${appSellingTheSubscription} has no bundle ID to sell in`)
  }
  return {
    web: stripe && stripeBilling(stripe),
    store: appStore && bundleId ? appStoreBilling({ ...appStore, bundleId }) : null
  }
}

function billingRules({ cloud, appStore }: BillingConfig) {
  const both =
    appStore?.environments.includes('Production') && appStore.environments.includes('Sandbox')
  return {
    cloud,
    storeTesting: both
      ? { environment: 'Sandbox', accounts: appStore?.sandboxAccounts ?? null }
      : null,
    stores: storeTraits
  }
}

function runInTheBackground(billing: Billing) {
  const settle = () =>
    billing
      .settleOwed()
      .catch(error => log('warn', 'settling owed refunds failed', failureFields(error)))
  const catchUp = () =>
    billing
      .catchUpOnStoreNotifications()
      .catch(error =>
        log('warn', 'catching up on App Store notifications failed', failureFields(error))
      )
  void settle()
  void catchUp()
  setInterval(settle, settleEveryMs).unref()
  setInterval(catchUp, housekeepingEveryMs).unref()
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
  const billing = createBilling(
    billingStore(database.db),
    billingProviders(config.billing),
    billingRules(config.billing)
  )
  runInTheBackground(billing)
  const service = wiredService({
    release: config.release,
    db: database.db,
    databaseReady: database.ready,
    auth,
    authConfig: config.auth,
    mailer,
    devMailbox,
    photoStorage: photoStorage(config.photos),
    billing
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
      billing: {
        cloud: config.billing.cloud.needsSubscription ? 'subscription' : 'free',
        stripe: config.billing.stripe ? stripeMode(config.billing.stripe.secretKey) : 'off',
        appStore: config.billing.appStore?.environments ?? 'off'
      },
      photos: config.photos?.kind ?? 'off'
    },
    close: () => database.close()
  })
}

runService(main)
