import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { exportPKCS8, generateKeyPair } from 'jose'
import { accessTokenVerifier } from '../auth/access-tokens'
import { appleRevoker } from '../auth/apple-revoke'
import { createAuth } from '../auth/auth'
import { appStoreBilling } from '../billing/app-store'
import { stripeBilling } from '../billing/stripe'
import type { CloudSettings } from '../billing-config'
import { type AuthConfig, migrationsFolder as migrations } from '../config'
import { accountStore } from '../db/accounts'
import { billingStore } from '../db/billing'
import { accountDeleter } from '../domain/account-deletion'
import { createAccounts } from '../domain/accounts'
import { cloudIsFree } from '../domain/cloud-access'
import { cursorKey, cursors } from '../domain/cursor'
import { createBilling } from '../domain/subscription-billing'
import { accountDeletedMessage } from '../email/account-notices'
import { DevMailbox } from '../email/mailbox'
import { createMailer } from '../email/mailer'
import { createApp } from '../http/app'
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
          { fetch: stripe.fetch, retries: 0 }
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

const billingRules = (standIns: BillingStandIns) => ({
  cloud: standIns.cloud ?? cloudIsFree,
  storeTesting: standIns.sandboxAccounts
    ? { environment: 'Sandbox', accounts: standIns.sandboxAccounts }
    : null
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
  const store = accountStore(db)
  const billing = createBilling(
    billingStore(db),
    billingProviders(standIns),
    billingRules(standIns)
  )
  const app = createApp({
    release: 'test',
    databaseReady: async () => true,
    auth,
    accounts: createAccounts(store, cursors(cursorKey(testSecret))),
    deleteAccount: accountDeleter(
      store,
      appleRevoker(config.apple, config.publicUrl),
      {
        accountDeleted: (email, language) =>
          void mailer.send(accountDeletedMessage(email, language))
      },
      billing
    ),
    billing,
    verifyAccessToken: accessTokenVerifier(() => auth.api.getJwks(), publicUrl),
    allowedOrigins: config.trustedOrigins,
    devMailbox: mailbox
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
  return { app, auth, billing, client, mailbox, call, rows, close: () => client.close() }
}

export type Service = Awaited<ReturnType<typeof startService>>
