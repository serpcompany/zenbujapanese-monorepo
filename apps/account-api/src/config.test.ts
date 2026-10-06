import { describe, expect, test } from 'vitest'
import { readConfig } from './config'

const databaseUrl = 'postgres://localhost:5432/account'
const base = {
  DATABASE_URL: databaseUrl,
  ACCOUNT_API_URL: 'https://account-api.zenbujapanese.com',
  ACCOUNT_API_SECRET: 'a-test-secret-of-at-least-thirty-two-characters'
}

function refusal(env: NodeJS.ProcessEnv): string {
  try {
    readConfig(env)
  } catch (error) {
    return String(error)
  }
  return 'accepted'
}

describe('readConfig', () => {
  test('needs a Postgres URL, and never repeats it in the error', () => {
    for (const DATABASE_URL of [undefined, '', 'mysql://localhost/account', 'postgres://']) {
      expect(refusal({ ...base, DATABASE_URL })).toMatch(/DATABASE_URL must be set/)
    }
    const refused = refusal({ ...base, DATABASE_URL: 'https://secret-password@x' })
    expect(refused).toMatch(/DATABASE_URL must be set/)
    expect(refused).not.toContain('secret-password')
  })

  test('needs its own URL, as an origin, and a secret of at least 32 characters', () => {
    expect(refusal({ ...base, ACCOUNT_API_URL: '' })).toMatch(/ACCOUNT_API_URL must be set/)
    expect(refusal({ ...base, ACCOUNT_API_URL: 'https://x.example/v1' })).toMatch(/origin/)
    expect(refusal({ ...base, ACCOUNT_API_SECRET: 'short' })).toMatch(/at least 32/)
  })

  test('defaults the port and release, finds the migrations, and turns every sign-in method off', () => {
    const config = readConfig(base)
    expect(config).toMatchObject({ port: 8789, databaseUrl, release: 'local' })
    expect(config.migrations).toMatch(/apps\/account-api\/migrations$/)
    expect(config.auth).toMatchObject({ apple: null, google: null, trustedOrigins: [] })
    expect(config.email).toEqual({
      from: 'Zenbu Japanese <support@zenbujapanese.com>',
      provider: null,
      allowedRecipients: null
    })
  })

  test('reads its port as the shared config does', () => {
    expect(readConfig({ ...base, PORT: '9000' }).port).toBe(9000)
    expect(refusal({ ...base, PORT: 'eighty' })).toContain('PORT')
  })

  test("reads each provider's client IDs, and the website's origins and cookie domain", () => {
    const config = readConfig({
      ...base,
      APPLE_CLIENT_IDS: 'com.zenbujapanese.web',
      APPLE_CLIENT_SECRET: 'apple-secret',
      APPLE_APP_BUNDLE_IDENTIFIER: 'com.zenbujapanese.dictionary',
      GOOGLE_CLIENT_IDS: 'web.apps.googleusercontent.com, ios.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'google-secret',
      ACCOUNT_API_TRUSTED_ORIGINS: 'https://zenbujapanese.com,https://staging.zenbujapanese.com',
      ACCOUNT_API_COOKIE_DOMAIN: 'zenbujapanese.com'
    })
    expect(config.auth).toMatchObject({
      apple: {
        clientIds: ['com.zenbujapanese.web'],
        clientSecret: 'apple-secret',
        appBundleIdentifier: 'com.zenbujapanese.dictionary'
      },
      google: {
        clientIds: ['web.apps.googleusercontent.com', 'ios.apps.googleusercontent.com'],
        clientSecret: 'google-secret'
      },
      trustedOrigins: ['https://zenbujapanese.com', 'https://staging.zenbujapanese.com'],
      cookieDomain: 'zenbujapanese.com'
    })
  })

  test('reads the email sender, and asks for what each one needs', () => {
    expect(
      readConfig({
        ...base,
        ACCOUNT_API_EMAIL: 'cloudflare',
        CLOUDFLARE_ACCOUNT_ID: 'acct',
        CLOUDFLARE_EMAIL_TOKEN: 'send-only',
        EMAIL_ALLOWED_RECIPIENTS: 'tester@serp.co,@zenbujapanese.com'
      }).email
    ).toMatchObject({
      provider: { kind: 'cloudflare', accountId: 'acct', token: 'send-only' },
      allowedRecipients: ['tester@serp.co', '@zenbujapanese.com']
    })
    expect(refusal({ ...base, ACCOUNT_API_EMAIL: 'cloudflare' })).toMatch(/CLOUDFLARE_ACCOUNT_ID/)
    expect(refusal({ ...base, ACCOUNT_API_EMAIL: 'usesend' })).toMatch(/USESEND_API_KEY/)
    expect(refusal({ ...base, ACCOUNT_API_EMAIL: 'carrier-pigeon' })).toMatch(
      /cloudflare, usesend, or dev-mailbox/
    )
  })

  test('keeps the dev mailbox to local runs: the image runs with NODE_ENV=production', () => {
    expect(readConfig({ ...base, ACCOUNT_API_EMAIL: 'dev-mailbox' }).email.provider).toEqual({
      kind: 'dev-mailbox'
    })
    expect(refusal({ ...base, ACCOUNT_API_EMAIL: 'dev-mailbox', NODE_ENV: 'production' })).toMatch(
      /for local runs/
    )
  })
})
