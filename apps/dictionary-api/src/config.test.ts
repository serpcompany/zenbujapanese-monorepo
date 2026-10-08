import { describe, expect, test } from 'vitest'
import { readConfig } from './config'

const apps = (env: NodeJS.ProcessEnv) =>
  readConfig({ DICTIONARY_API_TOKEN: 'a-token-of-sixteen', ...env }).apps

describe('the app routes settings', () => {
  test('are off without an account service', () => {
    expect(apps({})).toBeNull()
    expect(apps({ ACCOUNT_API_URL: '' })).toBeNull()
  })

  test("read the keys from the account service's JWKS, 60 requests a minute", () => {
    expect(apps({ ACCOUNT_API_URL: 'https://accounts.test/' })).toEqual({
      accountUrl: 'https://accounts.test',
      jwksUrl: 'https://accounts.test/v1/auth/jwks',
      requestsPerMinute: 60
    })
  })

  test('take the JWKS location and the limit when they are set', () => {
    expect(
      apps({
        ACCOUNT_API_URL: 'https://accounts.test',
        ACCOUNT_JWKS_URL: 'http://nginx.internal/jwks',
        APP_REQUESTS_PER_MINUTE: '30'
      })
    ).toMatchObject({ jwksUrl: 'http://nginx.internal/jwks', requestsPerMinute: 30 })
    expect(
      apps({ ACCOUNT_API_URL: 'https://accounts.test', APP_REQUESTS_PER_MINUTE: '' })
    ).toMatchObject({ requestsPerMinute: 60 })
  })

  test.each([
    [{ ACCOUNT_API_URL: 'accounts.test' }, /ACCOUNT_API_URL/],
    [{ ACCOUNT_API_URL: 'ftp://accounts.test' }, /ACCOUNT_API_URL/],
    [{ ACCOUNT_API_URL: 'https://accounts.test', ACCOUNT_JWKS_URL: '/jwks' }, /ACCOUNT_JWKS_URL/],
    [{ ACCOUNT_API_URL: 'https://accounts.test', APP_REQUESTS_PER_MINUTE: '0' }, /APP_REQUESTS/],
    [{ ACCOUNT_API_URL: 'https://accounts.test', APP_REQUESTS_PER_MINUTE: '1.5' }, /APP_REQUESTS/]
  ])('refuse %o', (env, message) => {
    expect(() => apps(env)).toThrow(message)
  })
})
