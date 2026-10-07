import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
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

  test("name each environment's account service on the API host", () => {
    expect(wrangler).toMatch(
      /"staging"[\s\S]*"ACCOUNT_API_URL": "https:\/\/api-staging\.zenbujapanese\.com"/
    )
    expect(wrangler).toMatch(
      /"production"[\s\S]*"ACCOUNT_API_URL": "https:\/\/api\.zenbujapanese\.com"/
    )
  })
})
