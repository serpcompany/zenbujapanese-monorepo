import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { exportPKCS8, generateKeyPair } from 'jose'
import { createAuth } from '../auth/auth'
import { appStoreBilling } from '../billing/app-store'
import { storeTraits } from '../billing/stores'
import { stripeBilling } from '../billing/stripe'
import type { CloudSettings } from '../billing-config'
import { type AuthConfig, migrationsFolder as migrations } from '../config'
import { billingStore } from '../db/billing'
import type { BillingStore } from '../domain/billing'
import { cloudIsFree } from '../domain/cloud-access'
import { createBilling } from '../domain/subscription-billing'
import { DevMailbox } from '../email/mailbox'
import { createMailer } from '../email/mailer'
import { MemoryPhotoStorage } from '../storage/memory'
import { wiredService } from '../wiring'
import { appAppleId, monthly, type StandInAppStore, yearly } from './app-store'
import { type StandInStripe, stripeSettings } from './stripe'

export const publicUrl = 'http://localhost:8789'
export const testSecret = 'test-only-secret-that-is-long-enough-for-better-auth'
export const appBundleIdentifier = 'com.zenbujapanese.dictionary'
export const websiteServicesId = 'com.zenbujapanese.website'
export const websiteOrigin = 'http://localhost:3000'
export const googleClientIds = ['web.apps.googleusercontent.com', 'ios.apps.googleusercontent.com']

const authConfig: AuthConfig = {
  publicUrl,
  secret: testSecret,
  trustedOrigins: [websiteOrigin],
  cookieDomain: undefined,
  cookiePrefix: 'zenbu-test',
  apple: { servicesIds: [], appBundleIdentifier, signingKey: null },
  google: { clientIds: googleClientIds, clientSecret: 'unused' }
}

let addresses = 0

async function appleSigningKey() {
  const { privateKey } = await generateKeyPair('ES256', { extractable: true })
  return { teamId: '847HR8U8D9', keyId: 'TESTKEY123', privateKey: await exportPKCS8(privateKey) }
}

export interface BillingStandIns {
  stripe?: StandInStripe
  stripeTrialDays?: number
  stripeGraceDays?: number
  appStore?: StandInAppStore
  appStoreApi?: boolean
  sandboxAccounts?: readonly string[]
  cloud?: CloudSettings
}

function billingProviders(standIns: BillingStandIns) {
  const { stripe, appStore } = standIns
  return {
    web: stripe
      ? stripeBilling(
          {
            ...stripeSettings,
            trialDays: standIns.stripeTrialDays ?? null,
            gracePeriodDays: standIns.stripeGraceDays ?? 0
          },
          { fetch: stripe.fetch, retries: 0, plansKeptForMs: 0 }
        )
      : null,
    store: appStore
      ? appStoreBilling(
          {
            bundleId: appBundleIdentifier,
            appAppleId,
            environments: ['Production', 'Sandbox'],
            products: [monthly, yearly],
            apiKey: null,
            sandboxAccounts: standIns.sandboxAccounts ?? null
          },
          standIns.appStoreApi
            ? { ...appStore.trust, apiClients: appStore.api.clients }
            : appStore.trust
        )
      : null
  }
}

function watchedTransactions(store: BillingStore, stripe: StandInStripe | undefined): BillingStore {
  let open = 0
  if (stripe) stripe.state.inATransaction = () => open > 0
  return {
    ...store,
    async transaction(work) {
      open += 1
      try {
        return await store.transaction(work)
      } finally {
        open -= 1
      }
    }
  }
}

const billingRules = (standIns: BillingStandIns) => ({
  cloud: standIns.cloud ?? cloudIsFree,
  storeTesting: standIns.sandboxAccounts
    ? { environment: 'Sandbox', accounts: standIns.sandboxAccounts }
    : null,
  stores: storeTraits
})

export async function startService({
  emailSender = true,
  appleKey = false,
  billing: standIns = {}
}: {
  emailSender?: boolean
  appleKey?: boolean
  billing?: BillingStandIns
} = {}) {
  const config: AuthConfig = appleKey
    ? {
        ...authConfig,
        apple: {
          servicesIds: [websiteServicesId],
          appBundleIdentifier,
          signingKey: await appleSigningKey()
        }
      }
    : authConfig
  const client = new PGlite()
  const db = drizzle(client)
  await migrate(db, { migrationsFolder: migrations })
  const mailbox = new DevMailbox()
  const mailer = createMailer(
    {
      from: 'Zenbu Japanese <support@zenbujapanese.com>',
      provider: emailSender ? { kind: 'dev-mailbox' } : null,
      allowedRecipients: null
    },
    mailbox
  )
  const auth = await createAuth({ config, db, mailer })
  const billing = createBilling(
    watchedTransactions(billingStore(db), standIns.stripe),
    billingProviders(standIns),
    billingRules(standIns)
  )
  const photoStorage = new MemoryPhotoStorage()
  const { app, files, housekeep } = wiredService({
    release: 'test',
    db,
    databaseReady: async () => true,
    auth,
    authConfig: config,
    mailer,
    devMailbox: mailbox,
    photoStorage,
    billing
  })
  const call = async (
    path: string,
    {
      body,
      token,
      method,
      from,
      client = 'zenbu-ios',
      headers = {}
    }: {
      body?: unknown
      token?: string
      method?: string
      from?: string
      client?: string | null
      headers?: Record<string, string>
    } = {}
  ) => {
    const response = await app.request(`${publicUrl}${path}`, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        'cf-connecting-ip': from ?? `10.${addresses++ % 250}.0.1`,
        ...(client ? { 'x-zenbu-client': client } : {}),
        ...headers
      },
      body: body === undefined || typeof body === 'string' ? body : JSON.stringify(body)
    })
    const text = await response.text()
    return {
      status: response.status,
      headers: response.headers,
      body: (text ? JSON.parse(text) : null) as Record<string, unknown> | null
    }
  }
  const rows = async (sql: string) => (await client.query<Record<string, unknown>>(sql)).rows
  const sendPhoto = async (token: string, photoId: string, bytes: Uint8Array, method = 'PUT') => {
    const response = await app.request(`${publicUrl}/v1/photos/${photoId}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'image/jpeg' },
      body: method === 'PUT' ? bytes : undefined
    })
    return new Response(await response.arrayBuffer(), response)
  }
  return {
    app,
    auth,
    billing,
    client,
    mailbox,
    call,
    rows,
    sendPhoto,
    files,
    housekeep,
    photoStorage,
    close: () => client.close()
  }
}

export type Service = Awaited<ReturnType<typeof startService>>
