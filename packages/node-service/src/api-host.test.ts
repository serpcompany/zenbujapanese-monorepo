import { expect, test } from 'vitest'
import { servedByAccountService, servedByEachServiceItself } from './api-host'

test.each([
  ['/v1/auth/sign-in/email-otp', true],
  ['/v1/auth', true],
  ['/v1/me', true],
  ['/v1/sync', true],
  ['/v1/health', true],
  ['/v1/meaning', false],
  ['/v1/syncopation', false],
  ['/v1/search/見る', false],
  ['/v1/words/1259290', false],
  ['/healthz', false]
])('sends %s to the account service: %s', (path, accounts) => {
  expect(servedByAccountService(path)).toBe(accounts)
})

test("keeps each service's /healthz and /dev/mail its own", () => {
  expect(servedByEachServiceItself('/healthz')).toBe(true)
  expect(servedByEachServiceItself('/dev/mail')).toBe(true)
  expect(servedByEachServiceItself('/v1/health')).toBe(false)
})
