import { describe, expect, test } from 'vitest'
import { useBillingService } from '../test/billing'
import { standInStripe } from '../test/stripe'

const billing = useBillingService({ stripe: standInStripe() })

const inTenDays = () => new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)

describe('an App Store subscription, after the App Store settings were removed', () => {
  test('is still managed in the App Store, and never blocks deleting the account', async () => {
    const learner = await billing.accounts.learner('store-off-running@example.com')
    await billing.holds(learner, { source: 'apple', expiresAt: inTenDays() })
    expect(await billing.subscription(learner)).toMatchObject({
      managedIn: 'app_store',
      running: [{ managedIn: 'app_store' }]
    })
    expect(await billing.deleteAccount(learner)).toMatchObject({
      status: 200,
      body: { status: 'deleted', appStoreSubscriptionContinues: true }
    })
  })

  test('says Apple keeps billing only while the App Store subscription renews', async () => {
    const learner = await billing.accounts.learner('store-off-not-renewing@example.com')
    await billing.holds(learner, { source: 'apple', expiresAt: inTenDays(), willRenew: false })
    expect(await billing.deleteAccount(learner)).toMatchObject({
      status: 200,
      body: { appStoreSubscriptionContinues: false }
    })
  })
})
