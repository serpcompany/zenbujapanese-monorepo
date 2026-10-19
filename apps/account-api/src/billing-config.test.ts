import { describe, expect, test } from 'vitest'
import { readBilling } from './billing-config'

const stripe = {
  STRIPE_SECRET_KEY: 'sk_test_x',
  STRIPE_WEBHOOK_SECRET: 'whsec_x',
  STRIPE_PRICE_IDS: 'price_monthly, price_yearly'
}
const appStore = {
  APP_STORE_PRODUCT_IDS: 'com.zenbujapanese.cloud.monthly',
  APP_STORE_ENVIRONMENTS: 'Production,Sandbox',
  APP_STORE_APP_APPLE_ID: '1234567890'
}

function refusal(env: NodeJS.ProcessEnv, local = false): string {
  try {
    readBilling(env, local)
  } catch (error) {
    return String(error)
  }
  return 'accepted'
}

describe('readBilling', () => {
  test('leaves cloud data free, and both stores off, until the owner sets them', () => {
    expect(readBilling({}, false)).toEqual({
      stripe: null,
      appStore: null,
      cloud: {
        needsSubscription: false,
        freeForAccountsMadeBefore: null,
        freeUntil: null,
        freeClients: []
      }
    })
  })

  test('reads Stripe, with its prices, trial, and grace period', () => {
    expect(
      readBilling({ ...stripe, STRIPE_TRIAL_DAYS: '7', STRIPE_GRACE_PERIOD_DAYS: '3' }, false)
        .stripe
    ).toEqual({
      secretKey: 'sk_test_x',
      webhookSecret: 'whsec_x',
      prices: ['price_monthly', 'price_yearly'],
      trialDays: 7,
      gracePeriodDays: 3
    })
    expect(readBilling(stripe, false).stripe).toMatchObject({ trialDays: null, gracePeriodDays: 0 })
  })

  test("refuses half of Stripe's settings, a key that isn't one, and a live key at localhost", () => {
    expect(refusal({ STRIPE_SECRET_KEY: 'sk_test_x' })).toMatch(/STRIPE_WEBHOOK_SECRET/)
    expect(refusal({ ...stripe, STRIPE_SECRET_KEY: 'pk_test_x' })).toMatch(/STRIPE_SECRET_KEY/)
    expect(refusal({ ...stripe, STRIPE_PRICE_IDS: 'prod_x' })).toMatch(/STRIPE_PRICE_IDS/)
    expect(refusal({ ...stripe, STRIPE_TRIAL_DAYS: 'a week' })).toMatch(/STRIPE_TRIAL_DAYS/)
    expect(refusal({ ...stripe, STRIPE_GRACE_PERIOD_DAYS: '90' })).toMatch(/0 to 60/)
    expect(refusal({ ...stripe, STRIPE_SECRET_KEY: 'sk_live_x' }, true)).toMatch(/localhost/)
    expect(refusal({ ...stripe, STRIPE_SECRET_KEY: 'rk_live_x' })).toBe('accepted')
  })

  test("reads the App Store's products and environments, and needs the app's Apple ID for Production", () => {
    expect(readBilling(appStore, false).appStore).toEqual({
      appAppleId: 1_234_567_890,
      environments: ['Production', 'Sandbox'],
      products: ['com.zenbujapanese.cloud.monthly']
    })
    expect(refusal({ ...appStore, APP_STORE_APP_APPLE_ID: '' })).toMatch(/APP_STORE_APP_APPLE_ID/)
    expect(
      refusal({ ...appStore, APP_STORE_ENVIRONMENTS: 'Sandbox', APP_STORE_APP_APPLE_ID: '' })
    ).toBe('accepted')
    expect(refusal({ ...appStore, APP_STORE_ENVIRONMENTS: '' })).toMatch(/APP_STORE_ENVIRONMENTS/)
    expect(refusal({ ...appStore, APP_STORE_ENVIRONMENTS: 'Staging' })).toMatch(
      /APP_STORE_ENVIRONMENTS/
    )
  })

  test("takes Xcode's unsigned purchases only at localhost", () => {
    const xcode = { ...appStore, APP_STORE_ENVIRONMENTS: 'Xcode' }
    expect(refusal(xcode)).toMatch(/only at localhost/)
    expect(readBilling(xcode, true).appStore?.environments).toEqual(['Xcode'])
  })

  test('reads when cloud data needs a subscription, for whom it stays free, and until when', () => {
    expect(
      readBilling(
        {
          ...stripe,
          ACCOUNT_API_CLOUD_ACCESS: 'subscription',
          ACCOUNT_API_CLOUD_FREE_FOR_ACCOUNTS_BEFORE: '2027-01-01T00:00:00Z',
          ACCOUNT_API_CLOUD_FREE_UNTIL: '2027-02-01T00:00:00Z',
          ACCOUNT_API_CLOUD_FREE_APPS: 'tomodachi'
        },
        false
      ).cloud
    ).toEqual({
      needsSubscription: true,
      freeForAccountsMadeBefore: new Date('2027-01-01T00:00:00Z'),
      freeUntil: new Date('2027-02-01T00:00:00Z'),
      freeClients: ['tomodachi']
    })
  })

  test('refuses a paywall with no way to pay, an unknown access, and a time that is not one', () => {
    expect(refusal({ ACCOUNT_API_CLOUD_ACCESS: 'subscription' })).toMatch(/a way to subscribe/)
    expect(refusal({ ACCOUNT_API_CLOUD_ACCESS: 'paid' })).toMatch(/free or subscription/)
    expect(refusal({ ACCOUNT_API_CLOUD_FREE_UNTIL: 'next spring' })).toMatch(/ISO 8601/)
  })
})
