import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { accountPagesFor, accountServiceIn } from './availability'
import { accountSettingsFrom } from './settings'

const wrangler = readFileSync(new URL('../../../wrangler.jsonc', import.meta.url), 'utf8')

describe("the website's account settings", () => {
  test('read the account service, and whether Apple and Google are offered, from the Worker vars', () => {
    expect(
      accountSettingsFrom({
        ACCOUNT_API_URL: 'https://api.zenbujapanese.com',
        ACCOUNT_APPLE_SERVICES_ID: 'com.zenbujapanese.web',
        ACCOUNT_GOOGLE_SIGN_IN: 'on'
      })
    ).toEqual({
      apiUrl: 'https://api.zenbujapanese.com',
      appleServicesId: 'com.zenbujapanese.web',
      google: true
    })
    expect(accountSettingsFrom({ ACCOUNT_API_URL: 'http://localhost:8789' })).toEqual({
      apiUrl: 'http://localhost:8789',
      appleServicesId: null,
      google: false
    })
  })

  test('leave signing in off without a service, or with a URL that is more than an origin', () => {
    expect(accountSettingsFrom({})).toBeNull()
    expect(accountSettingsFrom({ ACCOUNT_API_URL: 'https://api.zenbujapanese.com/v1' })).toBeNull()
  })

  test("name staging's account service, and none yet for production, so its pages stay closed", () => {
    expect(accountServiceIn(wrangler, 'staging')).toBe('https://api-staging.zenbujapanese.com')
    expect(accountServiceIn(wrangler, 'production')).toBeNull()
    expect(accountServiceIn(wrangler, undefined)).toBe('http://localhost:8789')
    expect(accountServiceIn(wrangler, 'preview')).toBeNull()
    expect(accountPagesFor(wrangler, 'staging')).toBe('open')
    expect(accountPagesFor(wrangler, 'production')).toBe('closed')
    expect(accountPagesFor(wrangler, undefined)).toBe('open')
  })

  test('close the footer, as the pages, for a value that is no origin', () => {
    const named = (value: string) =>
      JSON.stringify({ env: { production: { vars: { ACCOUNT_API_URL: value } } } })
    expect(accountPagesFor(named('https://api.zenbujapanese.com/v1'), 'production')).toBe('closed')
    expect(accountPagesFor(named('https://api.zenbujapanese.com'), 'production')).toBe('open')
  })
})
