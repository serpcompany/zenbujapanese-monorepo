import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { createAuth } from '../auth/auth'
import { type AuthConfig, migrationsFolder as migrations } from '../config'
import { DevMailbox } from '../email/mailbox'
import { createMailer } from '../email/mailer'
import { createApp } from '../http/app'

export const publicUrl = 'http://localhost:8789'
export const appBundleIdentifier = 'com.zenbujapanese.dictionary'
export const googleClientIds = ['web.apps.googleusercontent.com', 'ios.apps.googleusercontent.com']

const authConfig: AuthConfig = {
  publicUrl,
  secret: 'test-only-secret-that-is-long-enough-for-better-auth',
  trustedOrigins: [],
  cookieDomain: undefined,
  apple: { clientIds: ['com.zenbujapanese.web'], clientSecret: 'unused', appBundleIdentifier },
  google: { clientIds: googleClientIds, clientSecret: 'unused' }
}

let addresses = 0

export async function startService() {
  const client = new PGlite()
  const db = drizzle(client)
  await migrate(db, { migrationsFolder: migrations })
  const mailbox = new DevMailbox()
  const mailer = createMailer(
    {
      from: 'Zenbu Japanese <support@zenbujapanese.com>',
      provider: { kind: 'dev-mailbox' },
      allowedRecipients: null
    },
    mailbox
  )
  const auth = createAuth({ config: authConfig, db, mailer })
  const app = createApp({
    release: 'test',
    databaseReady: async () => true,
    auth,
    emailSignIn: true,
    devMailbox: mailbox
  })
  const call = async (
    path: string,
    {
      body,
      token,
      method,
      from
    }: { body?: unknown; token?: string; method?: string; from?: string } = {}
  ) => {
    const response = await app.request(`${publicUrl}${path}`, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        'cf-connecting-ip': from ?? `10.${addresses++ % 250}.0.1`
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
  return { app, client, mailbox, call, rows, close: () => client.close() }
}

export type Service = Awaited<ReturnType<typeof startService>>
