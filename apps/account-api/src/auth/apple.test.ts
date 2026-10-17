import { exportPKCS8, generateKeyPair, jwtVerify } from 'jose'
import { expect, test } from 'vitest'
import { appleClientSecret, appleSecretDays } from './apple'

test("makes Apple's client secret from the key: signed by it, for Apple, lasting 180 days", async () => {
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true })
  const key = {
    teamId: 'TEAM123456',
    keyId: 'KEY1234567',
    privateKey: await exportPKCS8(privateKey)
  }
  const now = new Date('2026-10-06T12:00:00Z')
  const secret = await appleClientSecret(key, 'com.zenbujapanese.website', now)
  const { payload, protectedHeader } = await jwtVerify(secret, publicKey, {
    issuer: 'TEAM123456',
    subject: 'com.zenbujapanese.website',
    audience: 'https://appleid.apple.com',
    currentDate: now
  })
  expect(protectedHeader).toMatchObject({ alg: 'ES256', kid: 'KEY1234567' })
  expect(Number(payload.exp) - Number(payload.iat)).toBe(appleSecretDays * 24 * 60 * 60)
})
