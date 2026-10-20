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
  stripe.state.refusingRefunds = null
  vi.restoreAllMocks()
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
        reference: `in_${id}_1`,
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
      managedIn: 'website',
      running: [],
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
      [expect.stringMatching(new RegExp(`^in_${id}_1:evt_`)), 'failed'],
      [expect.stringMatching(new RegExp(`^in_${id}_2:evt_`)), 'failed'],
      [`in_${id}_3`, 'succeeded']
    ])
  })

  test('keeps a paid invoice paid, though a failed attempt on it arrives after', async () => {
    const { learner, customer, id } = await subscribed('stripe-paid-late@example.com')
    const failed = invoice(id, customer, 'invoice.payment_failed', 1)
    await billing.stripeWebhook(invoice(id, customer, 'invoice.paid', 1))
    await billing.stripeWebhook(failed)
    expect(
      (await billing.ledger(learner.userId)).map(each => [each.reference, each.outcome])
    ).toEqual([
      [`in_${id}_1`, 'succeeded'],
      [`in_${id}_1:${JSON.parse(failed.body).id}`, 'failed']
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
    await billing.deleted(learner.userId)
    const id = String(subscription.id)
    const event = stripe.event('checkout.session.completed', {
      id: `cs_${id}`,
      object: 'checkout.session',
      mode: 'subscription',
      client_reference_id: learner.userId,
      customer: `cus_${id}`,
      subscription: id
    })
    return { id, event, answer: await billing.stripeWebhook(event) }
  }

  const refundsOf = (paymentIntent: string) =>
    stripe.requests.filter(
      each => each.path === '/v1/refunds' && each.form.get('payment_intent') === paymentIntent
    )

  test('refunds and cancels a checkout that completes after its account was deleted', async () => {
    const { id, answer } = await orphanedCheckout('stripe-orphan@example.com', 'pi_orphan')
    expect(answer.status).toBe(200)
    expect(stripe.requests.filter(each => each.method !== 'GET')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: 'POST',
          path: '/v1/refunds',
          idempotencyKey: 'refund-unwanted-pi_orphan'
        }),
        expect.objectContaining({ method: 'DELETE', path: `/v1/subscriptions/${id}` })
      ])
    )
    expect(stripe.subscriptions.get(id)?.status).toBe('canceled')
  })

  test('takes a refund Stripe already made, when the event comes again after its idempotency key expired', async () => {
    stripe.refunded.add('pi_refunded_already')
    const { id, answer } = await orphanedCheckout(
      'stripe-orphan-again@example.com',
      'pi_refunded_already'
    )
    expect(answer.status).toBe(200)
    expect(stripe.subscriptions.get(id)?.status).toBe('canceled')
  })

  test('cancels an orphaned checkout first, and keeps the refund owed until Stripe takes it', async () => {
    stripe.state.refusingRefunds = { status: 500, code: 'api_error' }
    logged()
    const { id, event, answer } = await orphanedCheckout(
      'stripe-orphan-retry@example.com',
      'pi_retry'
    )
    expect(answer.status).toBe(200)
    expect(stripe.subscriptions.get(id)?.status).toBe('canceled')
    expect(await billing.owedActions()).toContainEqual({
      subscription_id: id,
      attempts: 1,
      done: false
    })
    stripe.state.refusingRefunds = null
    expect((await billing.stripeWebhook(event)).status).toBe(200)
    await billing.retryOwedNow()
    expect(stripe.refunded.has('pi_retry')).toBe(true)
    expect(await billing.owedActions()).toContainEqual({
      subscription_id: id,
      attempts: 2,
      done: true
    })
    expect(refundsOf('pi_retry').map(each => each.idempotencyKey)).toEqual([
      'refund-unwanted-pi_retry',
      'refund-unwanted-pi_retry'
    ])
  })

  test('still cancels an orphaned checkout whose refund Stripe refuses for good, and logs it', async () => {
    stripe.state.refusingRefunds = { status: 400, code: 'charge_disputed' }
    const output = logged()
    const { id, answer } = await orphanedCheckout(
      'stripe-orphan-disputed@example.com',
      'pi_disputed'
    )
    expect(answer.status).toBe(200)
    expect(stripe.subscriptions.get(id)?.status).toBe('canceled')
    expect(output()).toContain("stripe: couldn't refund an unwanted subscription's payment")
  })

  test('refunds and cancels a running subscription whose account is gone, from any of its events', async () => {
    const { learner, id } = await subscribed('stripe-account-gone@example.com', {
      paymentIntent: 'pi_account_gone'
    })
    await billing.deleted(learner.userId)
    expect((await billing.stripeWebhook(updated(id))).status).toBe(200)
    expect(stripe.subscriptions.get(id)?.status).toBe('canceled')
    expect(stripe.refunded.has('pi_account_gone')).toBe(true)
    await billing.stripeWebhook(
      stripe.event('customer.subscription.deleted', { id, object: 'subscription' })
    )
    expect(refundsOf('pi_account_gone')).toHaveLength(1)
  })

  test('leaves a running subscription alone when its account is missing but was never deleted, as after a restore, and says so loudly', async () => {
    const { learner, id } = await subscribed('stripe-restored-away@example.com', {
      paymentIntent: 'pi_restored_away'
    })
    await billing.rows(`delete from users where id = '${learner.userId}'`)
    const lines = logged()
    await billing.stripeWebhook(updated(id))
    expect(stripe.subscriptions.get(id)?.status).toBe('active')
    expect(refundsOf('pi_restored_away')).toEqual([])
    expect(lines()).toContain('names an account this service never deleted, as after a restore')
  })

  test("refunds and cancels a second checkout that completes while the account's first subscription runs", async () => {
    const { learner, customer, id: first } = await subscribed('stripe-second@example.com')
    const second = stripe.subscription({
      userId: learner.userId,
      customer,
      paymentIntent: 'pi_second'
    })
    const secondId = String(second.id)
    await billing.stripeWebhook(updated(secondId))
    await billing.stripeWebhook(
      stripe.event('checkout.session.completed', {
        id: `cs_${secondId}`,
        object: 'checkout.session',
        mode: 'subscription',
        client_reference_id: learner.userId,
        customer,
        subscription: secondId
      })
    )
    expect(stripe.subscriptions.get(secondId)?.status).toBe('canceled')
    await billing.stripeWebhook(
      stripe.event('customer.subscription.deleted', { id: secondId, object: 'subscription' })
    )
    expect(stripe.requests).toContainEqual(
      expect.objectContaining({ path: '/v1/refunds', idempotencyKey: 'refund-unwanted-pi_second' })
    )
    expect(
      await billing.rows(
        `select provider_id, status from subscriptions where user_id = '${learner.userId}' order by provider_id = '${first}' desc`
      )
    ).toEqual([
      { provider_id: first, status: 'active' },
      { provider_id: secondId, status: 'expired' }
    ])
    expect((await billing.subscription(learner)).active).toBe(true)
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
