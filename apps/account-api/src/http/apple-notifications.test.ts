import { randomUUID } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import type { Learner } from '../test/accounts'
import { type NotificationFields, standInAppStore, yearly } from '../test/app-store'
import { useBillingService } from '../test/billing'

const appStore = standInAppStore()
const billing = useBillingService({ appStore })

const dayMs = 24 * 60 * 60 * 1000
const active = 1
const expired = 2
const billingRetry = 3
const gracePeriod = 4
const revoked = 5

async function learnerWithToken(email: string) {
  const learner = await billing.accounts.learner(email)
  return { learner, token: (await billing.subscription(learner)).appAccountToken }
}

const send = async (fields: NotificationFields) =>
  billing.appleWebhook(await appStore.notification(fields))

async function subscribed(email: string) {
  const { learner, token } = await learnerWithToken(email)
  const originalTransactionId = `${Date.now()}${Math.floor(Math.random() * 1000)}`
  const purchaseDate = Date.now() - dayMs
  const first = {
    originalTransactionId,
    transactionId: originalTransactionId,
    appAccountToken: token,
    purchaseDate
  }
  expect(
    await send({ type: 'SUBSCRIBED', subtype: 'INITIAL_BUY', transaction: first, status: active })
  ).toMatchObject({ status: 200 })
  return { learner, token, first }
}

const statusOf = async (learner: Learner) => {
  const {
    status,
    active: on,
    willRenew,
    managedIn,
    canSubscribe
  } = await billing.subscription(learner)
  return { status, active: on, willRenew, managedIn, canSubscribe }
}

describe('POST /v1/webhooks/apple', () => {
  test('SUBSCRIBED subscribes the account whose appAccountToken the purchase carries, and records the charge', async () => {
    const { learner, first } = await subscribed('apple-subscribed@example.com')
    expect(await billing.subscription(learner)).toMatchObject({
      status: 'active',
      active: true,
      source: 'apple',
      willRenew: true,
      managedIn: 'app_store',
      canSubscribe: false
    })
    expect(await billing.ledger(learner.userId)).toEqual([
      {
        source: 'apple',
        kind: 'charge',
        outcome: 'succeeded',
        reference: first.transactionId,
        amount: 499,
        currency: 'USD',
        subscription_id: first.originalTransactionId
      }
    ])
  })

  test("refuses what Apple didn't sign, and a payload changed after signing, and records nothing", async () => {
    const { learner, token } = await learnerWithToken('apple-forged@example.com')
    const uuid = randomUUID()
    const fields: NotificationFields = {
      type: 'SUBSCRIBED',
      uuid,
      transaction: { originalTransactionId: '9100', appAccountToken: token },
      status: active
    }
    const forged = await appStore.notification(fields, appStore.stranger)
    const genuine = JSON.parse(await appStore.notification(fields)).signedPayload as string
    const [header, , signature] = genuine.split('.')
    const changed = Buffer.from(
      JSON.stringify({
        notificationType: 'SUBSCRIBED',
        notificationUUID: uuid,
        signedDate: Date.now()
      })
    ).toString('base64url')
    for (const body of [
      forged,
      JSON.stringify({ signedPayload: `${header}.${changed}.${signature}` }),
      JSON.stringify({ signedPayload: 'not a jws' }),
      '{"nothing": true}',
      'not json'
    ]) {
      expect(await billing.appleWebhook(body)).toMatchObject({
        status: 400,
        body: { error: { code: 'invalid_signature' } }
      })
    }
    expect(await billing.events(`event_id = '${uuid}'`)).toEqual([])
    expect((await billing.subscription(learner)).status).toBe('none')
  })

  test("refuses a notification for another app or an environment the service doesn't take", async () => {
    const { token } = await learnerWithToken('apple-elsewhere@example.com')
    const transaction = { originalTransactionId: '9200', appAccountToken: token }
    for (const fields of [
      { type: 'SUBSCRIBED', transaction, environment: 'Xcode' },
      { type: 'SUBSCRIBED', transaction: { ...transaction, bundleId: 'com.example.other' } }
    ]) {
      expect((await send(fields)).status).toBe(400)
    }
  })

  test('takes a repeated notification once: it answers 200 and changes nothing', async () => {
    const { learner, first } = await subscribed('apple-twice@example.com')
    const uuid = randomUUID()
    const lapse = await appStore.notification({
      type: 'EXPIRED',
      subtype: 'VOLUNTARY',
      uuid,
      transaction: first,
      status: expired
    })
    expect(await billing.appleWebhook(lapse)).toMatchObject({ status: 200 })
    expect((await statusOf(learner)).status).toBe('expired')
    const resubscribed = {
      ...first,
      transactionId: `${first.transactionId}-2`,
      purchaseDate: Date.now()
    }
    await send({
      type: 'SUBSCRIBED',
      subtype: 'RESUBSCRIBE',
      transaction: resubscribed,
      status: active
    })
    expect(await billing.appleWebhook(lapse)).toMatchObject({
      status: 200,
      body: { received: true }
    })
    expect((await statusOf(learner)).active).toBe(true)
    expect(await billing.events(`event_id = '${uuid}'`)).toHaveLength(1)
  })

  test('a renewal moves the paid time on and is a charge in the ledger', async () => {
    const { learner, first } = await subscribed('apple-renews@example.com')
    const renewal = {
      ...first,
      transactionId: `${first.transactionId}-r1`,
      purchaseDate: Date.now(),
      expiresDate: Date.now() + 30 * dayMs,
      productId: yearly
    }
    await send({ type: 'DID_RENEW', transaction: renewal, status: active })
    expect(await billing.subscription(learner)).toMatchObject({
      active: true,
      productId: yearly,
      expiresAt: new Date(renewal.expiresDate).toISOString()
    })
    expect((await billing.ledger(learner.userId)).map(each => each.reference)).toEqual([
      first.transactionId,
      renewal.transactionId
    ])
  })

  test('turning auto-renew off keeps the paid time; expiring ends it and a new one may be offered', async () => {
    const { learner, first } = await subscribed('apple-cancels@example.com')
    await send({
      type: 'DID_CHANGE_RENEWAL_STATUS',
      subtype: 'AUTO_RENEW_DISABLED',
      transaction: first,
      renewal: { autoRenewStatus: 0 },
      status: active
    })
    expect(await statusOf(learner)).toEqual({
      status: 'active',
      active: true,
      willRenew: false,
      managedIn: 'app_store',
      canSubscribe: false
    })
    await send({
      type: 'EXPIRED',
      subtype: 'VOLUNTARY',
      transaction: first,
      renewal: { autoRenewStatus: 0 },
      status: expired
    })
    expect(await statusOf(learner)).toEqual({
      status: 'expired',
      active: false,
      willRenew: false,
      managedIn: null,
      canSubscribe: true
    })
  })

  test("a billing retry turns the features off; Apple's grace period keeps them on until it ends", async () => {
    const { learner, first } = await subscribed('apple-retry@example.com')
    const lapsed = { ...first, expiresDate: Date.now() - 1000 }
    await send({
      type: 'DID_FAIL_TO_RENEW',
      transaction: lapsed,
      renewal: { isInBillingRetryPeriod: true },
      status: billingRetry
    })
    expect(await statusOf(learner)).toMatchObject({
      status: 'billing_retry',
      active: false,
      managedIn: 'app_store',
      canSubscribe: false
    })
    const graceEnds = Date.now() + 16 * dayMs
    await send({
      type: 'DID_FAIL_TO_RENEW',
      subtype: 'GRACE_PERIOD',
      transaction: lapsed,
      renewal: { isInBillingRetryPeriod: true, gracePeriodExpiresDate: graceEnds },
      status: gracePeriod
    })
    expect(await billing.subscription(learner)).toMatchObject({
      status: 'grace_period',
      active: true,
      expiresAt: new Date(graceEnds).toISOString()
    })
    await send({
      type: 'GRACE_PERIOD_EXPIRED',
      transaction: lapsed,
      renewal: { isInBillingRetryPeriod: true },
      status: billingRetry
    })
    expect((await statusOf(learner)).status).toBe('billing_retry')
    const recovered = {
      ...first,
      transactionId: `${first.transactionId}-r`,
      purchaseDate: Date.now()
    }
    await send({
      type: 'DID_RENEW',
      subtype: 'BILLING_RECOVERY',
      transaction: recovered,
      status: active
    })
    expect((await statusOf(learner)).active).toBe(true)
  })

  test('a refund revokes the subscription and is in the ledger; a reversed refund restores both', async () => {
    const { learner, first } = await subscribed('apple-refund@example.com')
    const refunded = { ...first, revocationDate: Date.now(), revocationType: 'REFUND_FULL' }
    await send({ type: 'REFUND', transaction: refunded, status: revoked })
    expect(await statusOf(learner)).toMatchObject({
      status: 'revoked',
      active: false,
      canSubscribe: true
    })
    expect((await billing.ledger(learner.userId)).map(each => [each.kind, each.outcome])).toEqual([
      ['charge', 'succeeded'],
      ['refund', 'succeeded']
    ])
    await send({ type: 'REFUND_REVERSED', transaction: first, status: active })
    expect((await statusOf(learner)).active).toBe(true)
    expect((await billing.ledger(learner.userId)).map(each => [each.kind, each.outcome])).toEqual([
      ['charge', 'succeeded'],
      ['refund', 'reversed']
    ])
  })

  test('a partial refund records its share', async () => {
    const { learner, first } = await subscribed('apple-partial@example.com')
    await send({
      type: 'REFUND',
      transaction: {
        ...first,
        revocationDate: Date.now(),
        revocationType: 'REFUND_PRORATED',
        revocationPercentage: 50_000
      },
      status: revoked
    })
    expect(
      (await billing.ledger(learner.userId)).find(each => each.kind === 'refund')
    ).toMatchObject({ amount: 250 })
  })

  test("a notification that arrives late can't undo a newer one", async () => {
    const { learner, first } = await subscribed('apple-late@example.com')
    const late = await appStore.notification({
      type: 'DID_FAIL_TO_RENEW',
      transaction: first,
      renewal: { isInBillingRetryPeriod: true },
      status: billingRetry,
      signedDate: Date.now() - 60_000
    })
    const renewal = {
      ...first,
      transactionId: `${first.transactionId}-n`,
      purchaseDate: Date.now()
    }
    await send({ type: 'DID_RENEW', transaction: renewal, status: active })
    await billing.appleWebhook(late)
    expect((await statusOf(learner)).active).toBe(true)
  })

  test("a resubscription bought from another account moves the subscription there, and a late notice of the old one doesn't move it back", async () => {
    const { learner: before, first } = await subscribed('apple-moved-from@example.com')
    await send({ type: 'EXPIRED', subtype: 'VOLUNTARY', transaction: first, status: expired })
    const { learner: after, token } = await learnerWithToken('apple-moved-to@example.com')
    const resubscribed = {
      originalTransactionId: first.originalTransactionId,
      transactionId: `${first.transactionId}-again`,
      appAccountToken: token,
      purchaseDate: Date.now()
    }
    await send({
      type: 'SUBSCRIBED',
      subtype: 'RESUBSCRIBE',
      transaction: resubscribed,
      status: active
    })
    expect((await statusOf(after)).active).toBe(true)
    expect((await statusOf(before)).status).toBe('none')
    await send({
      type: 'DID_CHANGE_RENEWAL_STATUS',
      transaction: first,
      renewal: { autoRenewStatus: 0 },
      status: expired,
      signedDate: Date.now() + 1000
    })
    expect((await statusOf(after)).active).toBe(true)
    expect((await statusOf(before)).status).toBe('none')
  })

  test("records but applies nothing for a purchase no account claims, and Apple's test notification", async () => {
    const orphan = randomUUID()
    const testing = randomUUID()
    await send({
      type: 'SUBSCRIBED',
      uuid: orphan,
      transaction: { originalTransactionId: '9300', appAccountToken: randomUUID() },
      status: active
    })
    await send({ type: 'TEST', uuid: testing })
    for (const uuid of [orphan, testing]) {
      expect(await billing.events(`event_id = '${uuid}'`)).toEqual([
        expect.objectContaining({ source: 'apple', outcome: 'ignored', user_id: null })
      ])
    }
  })
})
