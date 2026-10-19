import { createHash, X509Certificate } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import { appleTrust, appStoreBilling } from './app-store'
import { minorUnits } from './app-store-states'

const publishedFingerprint = '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179'

describe("the App Store's trust", () => {
  test('is Apple Root CA - G3, as Apple publishes it, checked online', () => {
    expect(appleTrust.onlineChecks).toBe(true)
    expect(appleTrust.rootCertificates).toHaveLength(1)
    const [root] = appleTrust.rootCertificates
    expect(
      createHash('sha256')
        .update(root ?? Buffer.alloc(0))
        .digest('hex')
    ).toBe(publishedFingerprint)
    expect(new X509Certificate(root ?? Buffer.alloc(0)).subject).toContain('CN=Apple Root CA - G3')
  })

  test("needs the app's Apple ID to take Production purchases", () => {
    expect(() =>
      appStoreBilling({
        bundleId: 'com.zenbujapanese.dictionary',
        appAppleId: undefined,
        environments: ['Production'],
        products: ['monthly'],
        apiKey: null,
        sandboxAccounts: null
      })
    ).toThrow(/appAppleId/)
  })
})

describe("an App Store price, in thousandths, in the ledger's smallest unit", () => {
  test.each([
    [4990, 'USD', 499],
    [1_200_000, 'JPY', 1200],
    [12_345, 'KWD', 12_345],
    [4990, undefined, null],
    [4990, 'NOT A CURRENCY', null]
  ])('%s %s is %s', (milli, currency, minor) => {
    expect(minorUnits(milli, currency)).toBe(minor)
  })
})
