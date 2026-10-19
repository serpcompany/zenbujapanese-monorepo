import { afterEach, describe, expect, test, vi } from 'vitest'
import { mostOwedAttempts } from '../db/billing'
import { useBillingService } from '../test/billing'
import { logged } from '../test/logged'
import { standInStripe } from '../test/stripe'

const stripe = standInStripe()
const billing = useBillingService({ stripe })

afterEach(() => {
  stripe.state.refusingRefunds = null
  vi.restoreAllMocks()
})

const checkoutCompleted = (userId: string, customer: string, id: string) =>
  stripe.event('checkout.session.completed', {
    id: `cs_${id}`,
    object: 'checkout.session',
    mode: 'subscription',
    client_reference_id: userId,
    customer,
    subscription: id
  })

async function secondCheckout(email: string, fields: Parameters<typeof stripe.subscription>[0]) {
  const { learner, customer } = await billing.subscribeOnTheWebsite(stripe, email)
  const second = String(stripe.subscription({ userId: learner.userId, customer, ...fields }).id)
  return { learner, customer, second }
}

const refundsOf = (paymentIntent: string) =>
  stripe.requests.filter(
    each => each.path === '/v1/refunds' && each.form.get('payment_intent') === paymentIntent
  )

describe("the refunds the service owes, done after the event's transaction", () => {
  test('calls Stripe only outside a database transaction', async () => {
    const { learner, customer, second } = await secondCheckout('owed-outside@example.com', {
      paymentIntent: 'pi_owed_outside'
    })
    await billing.stripeWebhook(checkoutCompleted(learner.userId, customer, second))
    expect(refundsOf('pi_owed_outside')).toHaveLength(1)
    expect(stripe.requests.filter(each => each.duringATransaction)).toEqual([])
  })

  test('sends a konbini refund its instructions by email, as Stripe needs', async () => {
    stripe.konbini.add('pi_owed_konbini')
    const { learner, customer, second } = await secondCheckout('owed-konbini@example.com', {
      paymentIntent: 'pi_owed_konbini',
      email: 'owed-konbini@example.com'
    })
    await billing.stripeWebhook(checkoutCompleted(learner.userId, customer, second))
    expect(stripe.refunded.has('pi_owed_konbini')).toBe(true)
    expect(refundsOf('pi_owed_konbini').at(-1)?.form.get('instructions_email')).toBe(
      'owed-konbini@example.com'
    )
    expect(await billing.owedActions()).toContainEqual(
      expect.objectContaining({ subscription_id: second, done: true })
    )
  })

  test('claims each owed refund only as it runs it', async () => {
    const one = await secondCheckout('owed-one@example.com', { paymentIntent: 'pi_owed_one' })
    const two = await secondCheckout('owed-two@example.com', { paymentIntent: 'pi_owed_two' })
    stripe.state.refusingRefunds = { status: 500, code: 'api_error' }
    await billing.stripeWebhook(checkoutCompleted(one.learner.userId, one.customer, one.second))
    await billing.stripeWebhook(checkoutCompleted(two.learner.userId, two.customer, two.second))
    stripe.state.refusingRefunds = null
    await billing.rows('update billing_actions set claimed_until = null where done_at is null')
    const release = stripe.holdTheNextRead()
    const settling = billing.accounts.running.service.billing.settleOwed()
    await vi.waitFor(() => expect(stripe.requests.at(-1)?.path).toMatch(/^\/v1\/subscriptions\//))
    const claimed = await billing.rows(
      'select subscription_id from billing_actions where claimed_until is not null and done_at is null'
    )
    release()
    await settling
    expect(claimed).toHaveLength(1)
    expect(refundsOf('pi_owed_one').length + refundsOf('pi_owed_two').length).toBeGreaterThan(2)
  })

  test('gives up after its last attempt, and says so loudly', async () => {
    const lines = logged()
    const { learner, customer, second } = await secondCheckout('owed-gives-up@example.com', {
      paymentIntent: 'pi_owed_gives_up'
    })
    stripe.state.refusingRefunds = { status: 500, code: 'api_error' }
    await billing.stripeWebhook(checkoutCompleted(learner.userId, customer, second))
    await billing.rows(
      `update billing_actions set attempts = ${mostOwedAttempts - 1} where subscription_id = '${second}'`
    )
    await billing.retryOwedNow()
    expect(await billing.owedActions()).toContainEqual(
      expect.objectContaining({ subscription_id: second, attempts: mostOwedAttempts, done: true })
    )
    expect(lines()).toContain('gave up on an owed refund and cancel')
    const tried = refundsOf('pi_owed_gives_up').length
    await billing.retryOwedNow()
    expect(refundsOf('pi_owed_gives_up')).toHaveLength(tried)
  })

  test('logs a failure after the event committed, rather than crashing the service', async () => {
    const lines = logged()
    const { id } = await billing.subscribeOnTheWebsite(stripe, 'owed-broken@example.com')
    await billing.rows('alter table billing_actions rename to billing_actions_away')
    try {
      const event = stripe.event('customer.subscription.updated', { id, object: 'subscription' })
      const answer = await billing.call('/v1/webhooks/stripe', {
        method: 'POST',
        client: null,
        headers: { 'stripe-signature': event.signature },
        body: event.body
      })
      expect(answer.status).toBe(200)
      await vi.waitFor(() => expect(lines()).toContain('settling owed refunds failed'))
    } finally {
      await billing.rows('alter table billing_actions_away rename to billing_actions')
    }
  })
})

describe('a deleted account, and a read of Stripe from before the deletion', () => {
  test("doesn't refund its last payment when the event's read began before the account was deleted", async () => {
    const { learner, customer, id } = await billing.subscribeOnTheWebsite(
      stripe,
      'owed-stale@example.com',
      { paymentIntent: 'pi_owed_stale' }
    )
    const release = stripe.holdTheNextRead()
    const paid = billing.stripeWebhook(
      stripe.event('invoice.paid', {
        id: `in_${id}_2`,
        object: 'invoice',
        customer,
        amount_paid: 500,
        amount_due: 500,
        currency: 'usd',
        parent: { type: 'subscription_details', subscription_details: { subscription: id } }
      })
    )
    await vi.waitFor(() => expect(stripe.requests.at(-1)?.path).toBe(`/v1/subscriptions/${id}`))
    expect((await billing.deleteAccount(learner)).status).toBe(200)
    release()
    expect((await paid).status).toBe(200)
    expect(refundsOf('pi_owed_stale')).toEqual([])
    expect(stripe.subscriptions.get(id)?.status).toBe('canceled')
  })

  test("reads Stripe again for a checkout read just before the deletion, so it's refunded and canceled", async () => {
    const learner = await billing.accounts.learner('owed-mid-deletion@example.com')
    const customer = `cus_${learner.userId.slice(0, 10)}`
    const id = String(
      stripe.subscription({ userId: learner.userId, customer, paymentIntent: 'pi_owed_mid' }).id
    )
    const release = stripe.holdTheNextRead()
    const completed = billing.stripeWebhook(checkoutCompleted(learner.userId, customer, id))
    await vi.waitFor(() => expect(stripe.requests.at(-1)?.path).toBe(`/v1/subscriptions/${id}`))
    expect((await billing.deleteAccount(learner)).status).toBe(200)
    release()
    expect((await completed).status).toBe(200)
    const reads = stripe.requests.filter(each => each.path === `/v1/subscriptions/${id}`)
    expect(reads.length).toBeGreaterThanOrEqual(2)
    expect(stripe.subscriptions.get(id)?.status).toBe('canceled')
    expect(refundsOf('pi_owed_mid')).toHaveLength(1)
    expect(await billing.owedActions()).toContainEqual({
      subscription_id: id,
      attempts: 1,
      done: true
    })
  })
})
