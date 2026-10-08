import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { exportPKCS8, generateKeyPair } from 'jose'
import { accessTokenVerifier } from '../auth/access-tokens'
import { appleRevoker } from '../auth/apple-revoke'
import { createAuth } from '../auth/auth'
import { type AuthConfig, migrationsFolder as migrations } from '../config'
import { accountStore } from '../db/accounts'
import { accountDeleter } from '../domain/account-deletion'
import { createAccounts } from '../domain/accounts'
import { cursorKey, cursors } from '../domain/cursor'
import { accountDeletedMessage } from '../email/account-notices'
import { DevMailbox } from '../email/mailbox'
import { createMailer } from '../email/mailer'
import { createApp } from '../http/app'

export const publicUrl = 'http://localhost:8789'
export const testSecret = 'test-only-secret-that-is-long-enough-for-better-auth'
export const appBundleIdentifier = 'com.zenbujapanese.app'
export const websiteServicesId = 'com.zenbujapanese.web'
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
  return { teamId: 'W3GXL2NQQP', keyId: 'TESTKEY123', privateKey: await exportPKCS8(privateKey) }
}

export async function startService({
  emailSender = true,
  appleKey = false
}: {
  emailSender?: boolean
  appleKey?: boolean
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
  const app = createApp({
    release: 'test',
    databaseReady: async () => true,
    auth,
    accounts: createAccounts(store, cursors(cursorKey(testSecret))),
    deleteAccount: accountDeleter(store, appleRevoker(config.apple, config.publicUrl), {
      accountDeleted: email => void mailer.send(accountDeletedMessage(email))
    }),
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
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    const text = await response.text()
    return {
      status: response.status,
      headers: response.headers,
      body: (text ? JSON.parse(text) : null) as Record<string, unknown> | null
    }
  }
  const rows = async (sql: string) => (await client.query<Record<string, unknown>>(sql)).rows
  return { app, auth, client, mailbox, call, rows, close: () => client.close() }
}

export type Service = Awaited<ReturnType<typeof startService>>
