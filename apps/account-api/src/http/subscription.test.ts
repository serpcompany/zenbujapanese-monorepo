import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, test } from 'vitest'
import type { Learner } from '../test/accounts'
import { monthly, standInAppStore, yearly } from '../test/app-store'
import { useBillingService } from '../test/billing'
import { websiteOrigin } from '../test/service'
import { standInStripe } from '../test/stripe'

const stripe = standInStripe()
const appStore = standInAppStore()
const billing = useBillingService({ stripe, appStore, stripeTrialDays: 7 })

const dayMs = 24 * 60 * 60 * 1000
const pages = {
  successUrl: `${websiteOrigin}/account/?subscribed`,
  cancelUrl: `${websiteOrigin}/account/`
}

afterEach(() => {
  stripe.state.down = false
})

const postTransaction = (learner: Learner, signedTransaction: string) =>
  billing.call('/v1/me/subscription/apple', { token: learner.token, body: { signedTransaction } })

const checkout = (learner: Learner, body: Record<string, unknown>, headers = {}) =>
  billing.call('/v1/me/subscription/checkout', { token: learner.token, body, headers })

const portal = (learner: Learner, returnUrl = `${websiteOrigin}/account/`) =>
  billing.call('/v1/me/subscription/portal', { token: learner.token, body: { returnUrl } })

async function appleSubscriber(email: string) {
  const learner = await billing.accounts.learner(email)
  const token = (await billing.subscription(learner)).appAccountToken
  const originalTransactionId = randomUUID()
  const signed = await appStore.transaction({ originalTransactionId, appAccountToken: token })
  expect(await postTransaction(learner, signed)).toMatchObject({ status: 200 })
  return { learner, token, originalTransactionId }
}

async function stripeSubscriber(email: string) {
  const learner = await billing.accounts.learner(email)
  const customer = `cus_${learner.userId.slice(0, 10)}`
  const subscription = stripe.subscription({ userId: learner.userId, customer })
  await billing.stripeWebhook(
    stripe.event('checkout.session.completed', {
      id: `cs_${subscription.id}`,
      object: 'checkout.session',
      mode: 'subscription',
      client_reference_id: learner.userId,
      customer,
      subscription: subscription.id
    })
  )
  return { learner, customer, id: String(subscription.id) }
}

describe('GET /v1/me/subscription', () => {
  test('names no subscription, a stable appAccountToken, and what to offer', async () => {
    const learner = await billing.accounts.learner('sub-none@example.com')
    const first = await billing.subscription(learner)
    expect(first).toEqual({
      status: 'none',
      active: false,
      source: null,
      productId: null,
      expiresAt: null,
      willRenew: null,
      managedIn: null,
      canSubscribe: true,
      running: [],
      cloudAccess: 'free',
      appAccountToken: expect.stringMatching(/^[0-9a-f-]{36}$/),
      offers: { appStore: [monthly, yearly], website: ['price_monthly', 'price_yearly'] }
    })
    expect((await billing.subscription(learner)).appAccountToken).toBe(first.appAccountToken)
    const other = await billing.accounts.learner('sub-none-other@example.com')
    expect((await billing.subscription(other)).appAccountToken).not.toBe(first.appAccountToken)
  })

  test("needs the subscription scope, which Tomodachi's tokens don't carry", async () => {
    const tomodachi = await billing.accounts.learner('sub-tomodachi@example.com', 'tomodachi')
    expect(await billing.call('/v1/me/subscription', { token: tomodachi.token })).toMatchObject({
      status: 403,
      body: { error: { code: 'insufficient_scope' } }
    })
    expect((await billing.call('/v1/me/subscription', {})).status).toBe(401)
  })
})

describe('POST /v1/me/subscription/apple', () => {
  test("applies a purchase carrying the account's appAccountToken at once, and again is the same", async () => {
    const { learner, token, originalTransactionId } = await appleSubscriber('sub-apple@example.com')
    expect(await billing.subscription(learner)).toMatchObject({
      status: 'active',
      active: true,
      source: 'apple',
      productId: monthly,
      willRenew: null,
      managedIn: 'app_store',
      canSubscribe: false
    })
    const again = await appStore.transaction({
      originalTransactionId,
      transactionId: originalTransactionId,
      appAccountToken: token
    })
    expect((await postTransaction(learner, again)).status).toBe(200)
    expect((await postTransaction(learner, again)).status).toBe(200)
    expect(await billing.ledger(learner.userId)).toHaveLength(2)
  })

  test("refuses another account's purchase, by its token or because that account holds it", async () => {
    const {
      learner: owner,
      token,
      originalTransactionId
    } = await appleSubscriber('sub-apple-owner@example.com')
    const other = await billing.accounts.learner('sub-apple-other@example.com')
    for (const signed of [
      await appStore.transaction({ originalTransactionId: randomUUID(), appAccountToken: token }),
      await appStore.transaction({ originalTransactionId })
    ]) {
      expect(await postTransaction(other, signed)).toMatchObject({
        status: 409,
        body: { error: { code: 'subscription_belongs_to_another_account' } }
      })
    }
    expect((await billing.subscription(other)).status).toBe('none')
    expect((await billing.subscription(owner)).active).toBe(true)
  })

  test("gives a purchase with no token, or a deleted account's, to the first account that sends it", async () => {
    const learner = await billing.accounts.learner('sub-apple-untokened@example.com')
    const offerCode = await appStore.transaction({ originalTransactionId: randomUUID() })
    const deletedAccounts = await appStore.transaction({
      originalTransactionId: randomUUID(),
      appAccountToken: randomUUID()
    })
    for (const signed of [offerCode, deletedAccounts]) {
      expect((await postTransaction(learner, signed)).status).toBe(200)
    }
    expect((await billing.subscription(learner)).active).toBe(true)
  })

  test('moves a resubscription the device sends to the account its token names', async () => {
    const { learner: before, originalTransactionId } = await appleSubscriber(
      'sub-apple-moved-from@example.com'
    )
    const after = await billing.accounts.learner('sub-apple-moved-to@example.com')
    const appAccountToken = (await billing.subscription(after)).appAccountToken
    const resubscribed = await appStore.transaction({
      originalTransactionId,
      appAccountToken,
      purchaseDate: Date.now() + dayMs
    })
    expect((await postTransaction(after, resubscribed)).status).toBe(200)
    expect((await billing.subscription(after)).active).toBe(true)
    expect((await billing.subscription(before)).status).toBe('none')
  })

  test('advances to a later renewal the device saw first, and never back to an older one', async () => {
    const { learner, token, originalTransactionId } = await appleSubscriber(
      'sub-apple-advance@example.com'
    )
    const later = Date.now() + 40 * dayMs
    const renewed = await appStore.transaction({
      originalTransactionId,
      appAccountToken: token,
      purchaseDate: Date.now() + dayMs,
      expiresDate: later
    })
    await postTransaction(learner, renewed)
    await postTransaction(
      learner,
      await appStore.transaction({
        originalTransactionId,
        appAccountToken: token,
        purchaseDate: Date.now() - 5 * dayMs
      })
    )
    expect((await billing.subscription(learner)).expiresAt).toBe(new Date(later).toISOString())
  })

  test("refuses a transaction Apple didn't sign, another app's, an Xcode one, and one for a product the app doesn't offer", async () => {
    const learner = await billing.accounts.learner('sub-apple-refused@example.com')
    const originalTransactionId = randomUUID()
    for (const [signed, code] of [
      [
        await appStore.transaction({ originalTransactionId }, appStore.stranger),
        'invalid_transaction'
      ],
      [
        await appStore.transaction({ originalTransactionId, bundleId: 'com.example.other' }),
        'invalid_transaction'
      ],
      [
        await appStore.transaction({ originalTransactionId, environment: 'Xcode' }),
        'invalid_transaction'
      ],
      [
        await appStore.transaction({ originalTransactionId, type: 'Consumable' }),
        'invalid_transaction'
      ],
      [
        await appStore.transaction({ originalTransactionId, productId: 'com.example.coins' }),
        'unknown_product'
      ]
    ]) {
      expect(await postTransaction(learner, String(signed))).toMatchObject({
        status: 400,
        body: { error: { code } }
      })
    }
    expect((await billing.subscription(learner)).status).toBe('none')
  })
})

describe('POST /v1/me/subscription/checkout', () => {
  test("answers Stripe Checkout's URL for the account, in the page's language, with the account on the subscription", async () => {
    const learner = await billing.accounts.learner('sub-checkout@example.com')
    const answer = await checkout(
      learner,
      { price: 'price_yearly', ...pages },
      { 'content-language': 'ja' }
    )
    expect(answer).toMatchObject({
      status: 200,
      body: { url: expect.stringMatching(/^https:\/\/checkout\.stripe\.com\//) }
    })
    const created = stripe.requests.findLast(each => each.path === '/v1/checkout/sessions')
    expect(Object.fromEntries(created?.form ?? [])).toMatchObject({
      mode: 'subscription',
      'line_items[0][price]': 'price_yearly',
      client_reference_id: learner.userId,
      customer_email: 'sub-checkout@example.com',
      'subscription_data[metadata][zenbu_account]': learner.userId,
      success_url: pages.successUrl,
      cancel_url: pages.cancelUrl,
      locale: 'ja',
      'subscription_data[trial_period_days]': '7'
    })
    const expiresAt = Number(created?.form.get('expires_at'))
    const nowS = Date.now() / 1000
    expect(expiresAt).toBeGreaterThan(nowS + 29 * 60)
    expect(expiresAt).toBeLessThan(nowS + 31 * 60)
  })

  test("reuses the account's Stripe customer on a second checkout, after the first ended, with no second trial", async () => {
    const { learner, customer, id } = await stripeSubscriber('sub-checkout-again@example.com')
    stripe.change(id, { status: 'canceled' })
    await billing.stripeWebhook(
      stripe.event('customer.subscription.deleted', { id, object: 'subscription' })
    )
    expect((await checkout(learner, { price: 'price_monthly', ...pages })).status).toBe(200)
    const created = stripe.requests.findLast(each => each.path === '/v1/checkout/sessions')
    expect(created?.form.get('customer')).toBe(customer)
    expect(created?.form.has('customer_email')).toBe(false)
    expect(created?.form.has('subscription_data[trial_period_days]')).toBe(false)
  })

  test('never offers a second subscription, wherever the first was bought', async () => {
    const { learner: onTheWebsite } = await stripeSubscriber('sub-checkout-web@example.com')
    const { learner: inTheApp } = await appleSubscriber('sub-checkout-app@example.com')
    for (const learner of [onTheWebsite, inTheApp]) {
      expect(await checkout(learner, { price: 'price_monthly', ...pages })).toMatchObject({
        status: 409,
        body: { error: { code: 'already_subscribed' } }
      })
    }
  })

  test('lets a learner whose first payment never arrived check out again', async () => {
    const learner = await billing.accounts.learner('sub-checkout-unpaid@example.com')
    const subscription = stripe.subscription({ userId: learner.userId, firstPayment: 'open' })
    await billing.stripeWebhook(
      stripe.event('customer.subscription.created', { id: subscription.id, object: 'subscription' })
    )
    expect((await billing.subscription(learner)).status).toBe('pending')
    expect((await checkout(learner, { price: 'price_monthly', ...pages })).status).toBe(200)
    const created = stripe.requests.findLast(each => each.path === '/v1/checkout/sessions')
    const expiresAt = Number(created?.form.get('expires_at'))
    expect(expiresAt).toBeGreaterThan(Date.now() / 1000 + 29 * 60)
    expect(expiresAt).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 30 * 60)
  })

  test("refuses a price the website doesn't offer, none of several, and pages off the website", async () => {
    const learner = await billing.accounts.learner('sub-checkout-refused@example.com')
    expect(await checkout(learner, { price: 'price_other', ...pages })).toMatchObject({
      status: 400,
      body: { error: { code: 'unknown_price' } }
    })
    expect(await checkout(learner, pages)).toMatchObject({
      status: 400,
      body: { error: { code: 'unknown_price' } }
    })
    expect(
      await checkout(learner, { ...pages, successUrl: 'https://evil.example/' })
    ).toMatchObject({ status: 400, body: { error: { code: 'bad_request' } } })
  })

  test("answers 503 while Stripe doesn't answer", async () => {
    const learner = await billing.accounts.learner('sub-checkout-down@example.com')
    stripe.state.down = true
    expect(await checkout(learner, { price: 'price_monthly', ...pages })).toMatchObject({
      status: 503,
      body: { error: { code: 'billing_unavailable' } }
    })
  })
})

describe('POST /v1/me/subscription/portal', () => {
  test("opens Stripe's portal for a website subscriber's customer", async () => {
    const { learner, customer } = await stripeSubscriber('sub-portal@example.com')
    expect(await portal(learner)).toMatchObject({
      status: 200,
      body: { url: expect.stringMatching(/^https:\/\/billing\.stripe\.com\//) }
    })
    expect(
      stripe.requests
        .findLast(each => each.path === '/v1/billing_portal/sessions')
        ?.form.get('customer')
    ).toBe(customer)
  })

  test('opens nothing for an account that never bought on the website, an App Store subscriber included', async () => {
    const { learner } = await appleSubscriber('sub-portal-app@example.com')
    expect(await portal(learner)).toMatchObject({
      status: 404,
      body: { error: { code: 'no_subscription' } }
    })
    const nobody = await billing.accounts.learner('sub-portal-none@example.com')
    expect(await portal(nobody)).toMatchObject({
      status: 404,
      body: { error: { code: 'no_subscription' } }
    })
    expect((await portal(nobody, 'https://evil.example/')).status).toBe(400)
  })

  test('shows both subscriptions of a learner who pays in both stores, each manageable where it was bought', async () => {
    const { learner } = await stripeSubscriber('sub-both@example.com')
    const token = (await billing.subscription(learner)).appAccountToken
    const signed = await appStore.transaction({
      originalTransactionId: randomUUID(),
      appAccountToken: token,
      expiresDate: Date.now() + 90 * dayMs
    })
    expect((await postTransaction(learner, signed)).status).toBe(200)
    const both = await billing.subscription(learner)
    expect(both).toMatchObject({ source: 'apple', managedIn: 'app_store', canSubscribe: false })
    expect(both.running.map(each => [each.source, each.managedIn]).sort()).toEqual([
      ['apple', 'app_store'],
      ['stripe', 'website']
    ])
    expect((await portal(learner)).status).toBe(200)
  })
})
