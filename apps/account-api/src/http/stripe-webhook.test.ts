import { afterEach, describe, expect, test, vi } from 'vitest'
import { useBillingService } from '../test/billing'
import { logged } from '../test/logged'
import { standInStripe, stripeSettings } from '../test/stripe'

const stripe = standInStripe()
const billing = useBillingService({ stripe })

const dayS = 24 * 60 * 60
const nowS = () => Math.floor(Date.now() / 1000)

afterEach(() => {
  stripe.state.down = false
})

async function subscribed(email: string, fields: Parameters<typeof stripe.subscription>[0] = {}) {
  const learner = await billing.accounts.learner(email)
  const customer = `cus_${learner.userId.slice(0, 8)}`
  const subscription = stripe.subscription({ userId: learner.userId, customer, ...fields })
  const completed = stripe.event('checkout.session.completed', {
    id: `cs_${subscription.id}`,
    object: 'checkout.session',
    mode: 'subscription',
    client_reference_id: learner.userId,
    customer,
    subscription: subscription.id
  })
  expect(await billing.stripeWebhook(completed)).toMatchObject({ status: 200 })
  return { learner, customer, id: String(subscription.id) }
}

const updated = (id: string) =>
  stripe.event('customer.subscription.updated', { id, object: 'subscription' })

const invoice = (id: string, customer: string, type: string, attempt = 1, amount = 500) =>
  stripe.event(type, {
    id: `in_${id}_${attempt}`,
    object: 'invoice',
    customer,
    attempt_count: attempt,
    amount_paid: type === 'invoice.paid' ? amount : 0,
    amount_due: amount,
    currency: 'usd',
    parent: { type: 'subscription_details', subscription_details: { subscription: id } }
  })

const stripeReads = (id: string) =>
  stripe.requests.filter(each => each.method === 'GET' && each.path === `/v1/subscriptions/${id}`)
    .length

describe('POST /v1/webhooks/stripe', () => {
  test("a completed checkout subscribes the account it names, links Stripe's customer, and records the event", async () => {
    const { learner, customer, id } = await subscribed('stripe-checkout@example.com')
    expect(await billing.subscription(learner)).toMatchObject({
      status: 'active',
      active: true,
      source: 'stripe',
      productId: 'price_monthly',
      willRenew: true,
      managedIn: 'website',
      canSubscribe: false
    })
    expect(
      await billing.rows(
        `select stripe_customer_id from billing_customers where user_id = '${learner.userId}'`
      )
    ).toEqual([{ stripe_customer_id: customer }])
    expect(await billing.events(`user_id = '${learner.userId}'`)).toEqual([
      expect.objectContaining({ type: 'checkout.session.completed', outcome: 'applied' })
    ])
    expect(stripeReads(id)).toBe(1)
  })

  test("takes the account from the checkout when Stripe's subscription names none", async () => {
    const learner = await billing.accounts.learner('stripe-no-metadata@example.com')
    const subscription = stripe.subscription({ customer: 'cus_no_metadata' })
    await billing.stripeWebhook(
      stripe.event('checkout.session.completed', {
        id: 'cs_no_metadata',
        object: 'checkout.session',
        mode: 'subscription',
        client_reference_id: learner.userId,
        customer: 'cus_no_metadata',
        subscription: subscription.id
      })
    )
    expect((await billing.subscription(learner)).active).toBe(true)
    await billing.stripeWebhook(updated(String(subscription.id)))
    expect((await billing.subscription(learner)).active).toBe(true)
  })

  test('refuses a bad signature and a body changed after signing, and records nothing', async () => {
    const learner = await billing.accounts.learner('stripe-forged@example.com')
    const subscription = stripe.subscription({ userId: learner.userId })
    const event = updated(String(subscription.id))
    const forged = {
      ...event,
      signature: event.signature.replace(/v1=\w+/, `v1=${'0'.repeat(64)}`)
    }
    const tampered = { ...event, body: event.body.replace('subscription', 'subscriptioN') }
    for (const attempt of [forged, tampered, { ...event, signature: '' }]) {
      expect(await billing.stripeWebhook(attempt)).toMatchObject({
        status: 400,
        body: { error: { code: 'invalid_signature' } }
      })
    }
    expect(await billing.events(`event_id = '${JSON.parse(event.body).id}'`)).toEqual([])
    expect((await billing.subscription(learner)).status).toBe('none')
  })

  test('takes a repeated delivery once: it answers 200 and changes nothing', async () => {
    const { learner, id } = await subscribed('stripe-twice@example.com')
    const event = updated(id)
    expect(await billing.stripeWebhook(event)).toMatchObject({ status: 200 })
    const reads = stripeReads(id)
    stripe.change(id, { status: 'canceled' })
    expect(await billing.stripeWebhook(event)).toMatchObject({
      status: 200,
      body: { received: true }
    })
    expect(stripeReads(id)).toBe(reads)
    expect((await billing.subscription(learner)).active).toBe(true)
  })

  test('a renewal moves the paid period on, and its invoice is a charge in the ledger', async () => {
    const start = nowS()
    const { learner, customer, id } = await subscribed('stripe-renews@example.com', {
      periodStart: start - 30 * dayS,
      periodEnd: start
    })
    stripe.change(id, { periodStart: start, periodEnd: start + 30 * dayS })
    expect(await billing.stripeWebhook(invoice(id, customer, 'invoice.paid'))).toMatchObject({
      status: 200
    })
    expect((await billing.subscription(learner)).expiresAt).toBe(
      new Date((start + 30 * dayS) * 1000).toISOString()
    )
    expect(await billing.ledger(learner.userId)).toEqual([
      {
        source: 'stripe',
        kind: 'charge',
        outcome: 'succeeded',
        reference: `in_${id}_1:1`,
        amount: 500,
        currency: 'usd',
        subscription_id: id
      }
    ])
  })

  test('a cancellation keeps the paid time, then the subscription ends and a new one may be offered', async () => {
    const { learner, id } = await subscribed('stripe-cancels@example.com')
    stripe.change(id, { cancelAtPeriodEnd: true })
    await billing.stripeWebhook(updated(id))
    expect(await billing.subscription(learner)).toMatchObject({
      status: 'active',
      active: true,
      willRenew: false,
      canSubscribe: false
    })
    stripe.change(id, { status: 'canceled' })
    await billing.stripeWebhook(
      stripe.event('customer.subscription.deleted', { id, object: 'subscription' })
    )
    expect(await billing.subscription(learner)).toMatchObject({
      status: 'expired',
      active: false,
      managedIn: null,
      canSubscribe: true
    })
  })

  test('a failed renewal is a lapse: the features stop while Stripe retries, and its attempts are in the ledger', async () => {
    const { learner, customer, id } = await subscribed('stripe-lapses@example.com')
    stripe.change(id, { status: 'past_due' })
    await billing.stripeWebhook(invoice(id, customer, 'invoice.payment_failed', 1))
    await billing.stripeWebhook(invoice(id, customer, 'invoice.payment_failed', 2))
    expect(await billing.subscription(learner)).toMatchObject({
      status: 'billing_retry',
      active: false,
      managedIn: 'website',
      canSubscribe: false
    })
    stripe.change(id, { status: 'active' })
    await billing.stripeWebhook(invoice(id, customer, 'invoice.paid', 3))
    expect((await billing.subscription(learner)).active).toBe(true)
    expect(
      (await billing.ledger(learner.userId)).map(each => [each.reference, each.outcome])
    ).toEqual([
      [`in_${id}_1:1`, 'failed'],
      [`in_${id}_2:2`, 'failed'],
      [`in_${id}_3:3`, 'succeeded']
    ])
  })

  test('a refund is in the ledger once, its later outcome kept, and the subscription stands until it is canceled', async () => {
    const { learner, customer, id } = await subscribed('stripe-refunds@example.com')
    const refund = (type: string, status: string) =>
      stripe.event(type, {
        id: `re_${id}`,
        object: 'refund',
        amount: 500,
        currency: 'usd',
        customer,
        status,
        created: nowS()
      })
    await billing.stripeWebhook(refund('refund.updated', 'succeeded'))
    await billing.stripeWebhook(refund('refund.created', 'pending'))
    expect(await billing.ledger(learner.userId)).toEqual([
      expect.objectContaining({
        kind: 'refund',
        outcome: 'succeeded',
        reference: `re_${id}`,
        amount: 500
      })
    ])
    expect((await billing.subscription(learner)).active).toBe(true)
  })

  test("an older event delivered late can't undo a newer one: each reads the subscription as it is now", async () => {
    const { learner, id } = await subscribed('stripe-late@example.com')
    const older = updated(id)
    stripe.change(id, { status: 'canceled' })
    await billing.stripeWebhook(
      stripe.event('customer.subscription.deleted', { id, object: 'subscription' })
    )
    await billing.stripeWebhook(older)
    expect((await billing.subscription(learner)).status).toBe('expired')
  })

  test("ignores a subscription to a price the website doesn't sell, and one for no account", async () => {
    const learner = await billing.accounts.learner('stripe-other-price@example.com')
    const other = stripe.subscription({ userId: learner.userId, price: 'price_something_else' })
    const nobody = stripe.subscription({ customer: 'cus_nobody' })
    for (const each of [other, nobody]) {
      const event = updated(String(each.id))
      expect(await billing.stripeWebhook(event)).toMatchObject({ status: 200 })
      expect(await billing.events(`event_id = '${JSON.parse(event.body).id}'`)).toEqual([
        expect.objectContaining({ outcome: 'ignored' })
      ])
    }
    expect((await billing.subscription(learner)).status).toBe('none')
  })

  async function orphanedCheckout(email: string, paymentIntent: string) {
    const learner = await billing.accounts.learner(email)
    const subscription = stripe.subscription({ userId: learner.userId, paymentIntent })
    await billing.rows(`delete from users where id = '${learner.userId}'`)
    const id = String(subscription.id)
    const answer = await billing.stripeWebhook(
      stripe.event('checkout.session.completed', {
        id: `cs_${id}`,
        object: 'checkout.session',
        mode: 'subscription',
        client_reference_id: learner.userId,
        customer: `cus_${id}`,
        subscription: id
      })
    )
    return { id, answer }
  }

  test('refunds and cancels a checkout that completes after its account was deleted', async () => {
    const { id, answer } = await orphanedCheckout('stripe-orphan@example.com', 'pi_orphan')
    expect(answer.status).toBe(200)
    expect(stripe.requests.filter(each => each.method !== 'GET')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: 'POST',
          path: '/v1/refunds',
          idempotencyKey: 'refund-orphaned-pi_orphan'
        }),
        expect.objectContaining({ method: 'DELETE', path: `/v1/subscriptions/${id}` })
      ])
    )
    expect(stripe.subscriptions.get(id)?.status).toBe('canceled')
  })

  test('refunds an orphaned checkout once, though Stripe sends its event again after a day', async () => {
    stripe.refunded.add('pi_refunded_already')
    const { id, answer } = await orphanedCheckout(
      'stripe-orphan-again@example.com',
      'pi_refunded_already'
    )
    expect(answer.status).toBe(200)
    expect(stripe.subscriptions.get(id)?.status).toBe('canceled')
  })

  test("answers 503 and records nothing while Stripe doesn't answer, so Stripe sends the event again", async () => {
    const learner = await billing.accounts.learner('stripe-down@example.com')
    const subscription = stripe.subscription({ userId: learner.userId })
    const event = updated(String(subscription.id))
    stripe.state.down = true
    const output = logged()
    expect(await billing.stripeWebhook(event)).toMatchObject({
      status: 503,
      body: { error: { code: 'try_again' } }
    })
    expect(output()).toContain('stripe: read a subscription failed')
    expect(output()).not.toContain(stripeSettings.secretKey)
    vi.restoreAllMocks()
    expect(await billing.events(`event_id = '${JSON.parse(event.body).id}'`)).toEqual([])
    stripe.state.down = false
    expect(await billing.stripeWebhook(event)).toMatchObject({ status: 200 })
    expect((await billing.subscription(learner)).active).toBe(true)
  })
})
