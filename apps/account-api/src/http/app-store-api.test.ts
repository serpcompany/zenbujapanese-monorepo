import { randomUUID } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import type { Learner } from '../test/accounts'
import { standInAppStore } from '../test/app-store'
import { useBillingService } from '../test/billing'
import { websiteOrigin } from '../test/service'
import { standInStripe } from '../test/stripe'

const appStore = standInAppStore()
const stripe = standInStripe()
const billing = useBillingService({
  appStore,
  stripe,
  appStoreApi: true,
  sandboxAccounts: [
    'app-review@example.com',
    'app-review-first@example.com',
    'app-review-second@example.com'
  ]
})

const dayMs = 24 * 60 * 60 * 1000
const expired = 2
const billingRetry = 3

async function learnerWithToken(email: string) {
  const learner = await billing.accounts.learner(email)
  return { learner, token: (await billing.subscription(learner)).appAccountToken }
}

const post = (learner: Learner, signedTransaction: string) =>
  billing.call('/v1/me/subscription/apple', { token: learner.token, body: { signedTransaction } })

describe('the App Store Server API, when its key is set', () => {
  test("answers a device's purchase with the store's own status, which ends a stale billing retry", async () => {
    const { learner, token } = await learnerWithToken('app-review@example.com')
    const originalTransactionId = randomUUID()
    const purchase = {
      originalTransactionId,
      appAccountToken: token,
      purchaseDate: Date.now() - dayMs
    }
    appStore.api.statuses.set(originalTransactionId, {
      status: billingRetry,
      transaction: { ...purchase, expiresDate: Date.now() - 1000 },
      renewal: { isInBillingRetryPeriod: true }
    })
    expect((await post(learner, await appStore.transaction(purchase))).status).toBe(200)
    expect(await billing.subscription(learner)).toMatchObject({
      status: 'billing_retry',
      active: false,
      canSubscribe: false
    })
    appStore.api.statuses.set(originalTransactionId, {
      status: expired,
      transaction: { ...purchase, expiresDate: Date.now() - 1000 }
    })
    await post(learner, await appStore.transaction(purchase))
    expect(await billing.subscription(learner)).toMatchObject({
      status: 'expired',
      canSubscribe: true
    })
  })

  test("claims a purchase for the account Apple's latest transaction names, so an old copy can't move it back", async () => {
    const { learner: first, token: firstToken } = await learnerWithToken(
      'app-review-first@example.com'
    )
    const { learner: second, token: secondToken } = await learnerWithToken(
      'app-review-second@example.com'
    )
    const originalTransactionId = randomUUID()
    const bought = { originalTransactionId, appAccountToken: firstToken }
    appStore.api.statuses.set(originalTransactionId, { status: 1, transaction: bought })
    const oldCopy = await appStore.transaction(bought)
    expect((await post(first, oldCopy)).status).toBe(200)
    const resubscribed = {
      originalTransactionId,
      transactionId: randomUUID(),
      appAccountToken: secondToken,
      purchaseDate: Date.now()
    }
    appStore.api.statuses.set(originalTransactionId, { status: 1, transaction: resubscribed })
    expect((await post(second, await appStore.transaction(resubscribed))).status).toBe(200)
    expect(await post(first, oldCopy)).toMatchObject({
      status: 409,
      body: { error: { code: 'subscription_belongs_to_another_account' } }
    })
    expect((await billing.subscription(second)).active).toBe(true)
    expect((await billing.subscription(first)).active).toBe(false)
  })

  test('catches up on a notification that never reached the service, once', async () => {
    const { learner, token } = await learnerWithToken('app-review-missed@example.com')
    const originalTransactionId = randomUUID()
    const missed = JSON.parse(
      await appStore.notification({
        type: 'SUBSCRIBED',
        transaction: { originalTransactionId, appAccountToken: token },
        status: 1,
        environment: 'Production'
      })
    ).signedPayload as string
    appStore.api.history.push(missed)
    expect(await billing.accounts.running.service.billing.catchUpOnStoreNotifications()).toBe(1)
    expect(await billing.accounts.running.service.billing.catchUpOnStoreNotifications()).toBe(0)
    expect((await billing.subscription(learner)).source).toBe('apple')
  })

  test('goes on past a notification that fails while it catches up, and applies the next', async () => {
    const { token: failingToken } = await learnerWithToken('catch-up-fails@example.com')
    const { learner, token } = await learnerWithToken('catch-up-next@example.com')
    const failing = randomUUID()
    const notified = async (appAccountToken: string, originalTransactionId: string) =>
      JSON.parse(
        await appStore.notification({
          type: 'SUBSCRIBED',
          transaction: { originalTransactionId, appAccountToken },
          status: 1,
          environment: 'Production'
        })
      ).signedPayload as string
    appStore.api.history.push(
      await notified(failingToken, failing),
      await notified(token, randomUUID())
    )
    await billing.rows(
      `create function refuse_one() returns trigger as $$ begin if new.provider_id = '${failing}' then raise exception 'refused for the test'; end if; return new; end $$ language plpgsql`
    )
    await billing.rows(
      'create trigger refuse_one before insert on subscriptions for each row execute function refuse_one()'
    )
    try {
      expect(await billing.accounts.running.service.billing.catchUpOnStoreNotifications()).toBe(1)
    } finally {
      await billing.rows('drop trigger refuse_one on subscriptions')
      await billing.rows('drop function refuse_one')
    }
    expect((await billing.subscription(learner)).source).toBe('apple')
  })
})

describe('a sandbox purchase in production', () => {
  test("counts only for the accounts the owner allows, such as App Review's", async () => {
    const { learner: tester, token } = await learnerWithToken('testflight-tester@example.com')
    const signed = await appStore.transaction({
      originalTransactionId: randomUUID(),
      appAccountToken: token,
      environment: 'Sandbox'
    })
    expect((await post(tester, signed)).status).toBe(200)
    expect(await billing.subscription(tester)).toMatchObject({
      status: 'none',
      active: false,
      canSubscribe: true
    })
    const checkout = await billing.call('/v1/me/subscription/checkout', {
      token: tester.token,
      body: {
        price: 'price_monthly',
        successUrl: `${websiteOrigin}/account/`,
        cancelUrl: `${websiteOrigin}/account/`
      }
    })
    expect(checkout.status).toBe(200)
    const customer = `cus_${tester.userId.slice(0, 10)}`
    const id = String(stripe.subscription({ userId: tester.userId, customer }).id)
    await billing.stripeWebhook(
      stripe.event('checkout.session.completed', {
        id: `cs_${id}`,
        object: 'checkout.session',
        mode: 'subscription',
        client_reference_id: tester.userId,
        customer,
        subscription: id
      })
    )
    expect(await billing.owedActions()).not.toContainEqual(
      expect.objectContaining({ subscription_id: id })
    )
    expect(await billing.subscription(tester)).toMatchObject({ active: true, source: 'stripe' })
  })
})

describe("an App Store revocation that isn't a refund", () => {
  test('revokes the subscription and records no refund', async () => {
    const { learner, token } = await learnerWithToken('app-review-assigned@example.com')
    const originalTransactionId = randomUUID()
    const purchase = {
      originalTransactionId,
      transactionId: originalTransactionId,
      appAccountToken: token
    }
    await billing.appleWebhook(
      await appStore.notification({
        type: 'REVOKE',
        environment: 'Production',
        transaction: {
          ...purchase,
          revocationDate: Date.now(),
          revocationType: 'ASSIGNMENT_REVOKE'
        },
        status: 5
      })
    )
    expect((await billing.subscription(learner)).status).toBe('revoked')
    expect((await billing.ledger(learner.userId)).map(each => each.kind)).toEqual(['charge'])
  })
})
