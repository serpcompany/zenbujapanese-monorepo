import { randomUUID } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import type { Learner } from '../test/accounts'
import { standInAppStore } from '../test/app-store'
import { useBillingService } from '../test/billing'

const appStore = standInAppStore()
const billing = useBillingService({
  appStore,
  appStoreApi: true,
  sandboxAccounts: ['app-review@example.com']
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
    expect(await billing.subscription(tester)).toMatchObject({ status: 'none', active: false })
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
