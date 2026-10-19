import { describe, expect, test } from 'vitest'
import { useBillingService } from '../test/billing'
import { logged } from '../test/logged'
import { standInStripe } from '../test/stripe'

const stripe = standInStripe()
const billing = useBillingService({ stripe, stripeGraceDays: 3 })

const dayS = 24 * 60 * 60
const nowS = () => Math.floor(Date.now() / 1000)

const subscribed = (email: string, fields: Parameters<typeof stripe.subscription>[0] = {}) =>
  billing.subscribeOnTheWebsite(stripe, email, fields)

const updated = (id: string) =>
  stripe.event('customer.subscription.updated', { id, object: 'subscription' })

describe("Stripe's payments, past the card's", () => {
  test('keeps the features through a grace period from the first failed payment, which a new period never restarts', async () => {
    const renewed = nowS() - 2 * dayS
    const { learner, id } = await subscribed('pay-grace@example.com', { periodStart: renewed })
    stripe.change(id, { status: 'past_due', periodStart: renewed })
    await billing.stripeWebhook(updated(id))
    const graced = await billing.subscription(learner)
    expect(graced).toMatchObject({ status: 'grace_period', active: true })
    stripe.change(id, { status: 'past_due', periodStart: nowS(), periodEnd: nowS() + 30 * dayS })
    await billing.stripeWebhook(updated(id))
    expect((await billing.subscription(learner)).expiresAt).toBe(graced.expiresAt)
  })

  test('gives nothing until a delayed first payment, by a bank debit or konbini, arrives', async () => {
    const { learner, id } = await subscribed('pay-delayed@example.com', { firstPayment: 'open' })
    expect(await billing.subscription(learner)).toMatchObject({
      status: 'pending',
      active: false,
      canSubscribe: false,
      running: [{ status: 'pending', managedIn: 'website' }]
    })
    stripe.change(id, { firstPayment: 'paid' })
    await billing.stripeWebhook(
      stripe.event('checkout.session.async_payment_succeeded', {
        id: `cs_${id}`,
        object: 'checkout.session',
        mode: 'subscription',
        client_reference_id: learner.userId,
        subscription: id
      })
    )
    expect((await billing.subscription(learner)).active).toBe(true)
  })

  test('records a dispute and an early fraud warning against the charge, and changes no access', async () => {
    const { learner, customer, id } = await subscribed('pay-dispute@example.com')
    stripe.charges.set('ch_disputed', customer)
    const dispute = (type: string, status: string) =>
      stripe.event(type, {
        id: 'dp_1',
        object: 'dispute',
        amount: 500,
        currency: 'usd',
        charge: 'ch_disputed',
        payment_intent: null,
        status,
        created: nowS()
      })
    await billing.stripeWebhook(dispute('charge.dispute.created', 'needs_response'))
    await billing.stripeWebhook(
      stripe.event('radar.early_fraud_warning.created', {
        id: 'issfr_1',
        object: 'radar.early_fraud_warning',
        charge: 'ch_disputed',
        fraud_type: 'made_with_stolen_card',
        created: nowS()
      })
    )
    await billing.stripeWebhook(dispute('charge.dispute.closed', 'lost'))
    expect(
      (await billing.ledger(learner.userId))
        .filter(each => each.kind !== 'charge')
        .map(each => [each.kind, each.outcome, each.reference])
    ).toEqual([
      ['dispute', 'lost', 'dp_1'],
      ['fraud_warning', 'open', 'issfr_1']
    ])
    expect((await billing.subscription(learner)).active).toBe(true)
    expect(stripe.subscriptions.get(id)?.status).toBe('active')
  })

  test('links a refund to the invoice and subscription it paid, and keeps a later outcome over a retried earlier one', async () => {
    const { learner, customer, id } = await subscribed('pay-refund-order@example.com')
    stripe.payments.set('pi_refunded', {
      id: `in_${id}`,
      object: 'invoice',
      customer,
      parent: { type: 'subscription_details', subscription_details: { subscription: id } }
    })
    const refund = (type: string, status: string, created: number) =>
      stripe.event(
        type,
        {
          id: 're_ordered',
          object: 'refund',
          amount: 500,
          currency: 'usd',
          payment_intent: 'pi_refunded',
          customer: null,
          status,
          created: nowS() - 60
        },
        undefined,
        created
      )
    await billing.stripeWebhook(refund('refund.failed', 'failed', nowS()))
    await billing.stripeWebhook(refund('refund.created', 'succeeded', nowS() - 30))
    expect(
      (await billing.ledger(learner.userId)).find(each => each.kind === 'refund')
    ).toMatchObject({
      outcome: 'failed',
      subscription_id: id
    })
    expect(
      await billing.rows(
        `select payment_reference from billing_ledger where reference = 're_ordered'`
      )
    ).toEqual([{ payment_reference: `in_${id}` }])
  })

  test('refuses a thin event, which carries no object, and says so in the log', async () => {
    const output = logged()
    expect(
      await billing.stripeWebhook(stripe.thin('v1.customer.subscription.updated'))
    ).toMatchObject({
      status: 400,
      body: { error: { code: 'unreadable_event' } }
    })
    expect(output()).toContain('the endpoint must send Snapshot events')
    expect(output()).not.toContain('failed its signature check')
  })
})
