import { log } from '@zenbu/node-service/log'
import Stripe from 'stripe'
import type { StripeSettings } from '../billing-config'
import {
  type BillingProvider,
  BillingUnavailable,
  type CheckoutSession,
  type ProviderEvent,
  type WebsitePlan
} from '../domain/billing'
import {
  accountMetadataKey,
  customerHint,
  disputeEntry,
  idOf,
  type PaymentLink,
  providerEvent,
  refundEntry,
  stripeSource,
  subscriptionState
} from './stripe-events'

export interface StripeConnection {
  fetch: typeof globalThis.fetch
  retries: number
  plansKeptForMs?: number
}

const plansKeptForMs = 5 * 60_000

const timeoutMs = 10_000
const checkoutMinutes = 30
const ended = new Set<Stripe.Subscription.Status>(['canceled', 'incomplete_expired'])
const disputeTypes = new Set(['charge.dispute.created', 'charge.dispute.closed'])
const refundTypes = new Set(['refund.created', 'refund.updated', 'refund.failed'])

export const stripeMode = (secretKey: string) =>
  /^(sk|rk)_live_/.test(secretKey) ? ('live' as const) : ('test' as const)

async function guarded<T>(what: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    const failure = error instanceof Stripe.errors.StripeError ? error : null
    log('error', `stripe: ${what} failed`, {
      type: failure?.type ?? (error instanceof Error ? error.name : 'unknown'),
      code: failure?.code ?? null,
      status: failure?.statusCode ?? null,
      requestId: failure?.requestId ?? null
    })
    throw new BillingUnavailable(`Stripe could not ${what}`)
  }
}

const intervals = new Set<string>(['day', 'week', 'month', 'year'])

const isInterval = (interval: string): interval is WebsitePlan['interval'] =>
  intervals.has(interval)

function planOf(price: Stripe.Price): WebsitePlan {
  const product = typeof price.product === 'object' && !price.product.deleted ? price.product : null
  const interval = price.recurring?.interval ?? ''
  if (price.unit_amount === null || price.recurring === null || !isInterval(interval)) {
    throw new Error(`price ${price.id} has no fixed recurring amount`)
  }
  return {
    price: price.id,
    name: product?.name ?? price.nickname ?? price.id,
    amount: price.unit_amount,
    currency: price.currency,
    interval,
    intervalCount: price.recurring.interval_count
  }
}

function readable(event: Stripe.Event): boolean {
  const object = (event as { object?: unknown }).object
  const data = (event as { data?: { object?: unknown } }).data
  return object === 'event' && typeof data?.object === 'object' && data.object !== null
}

export function stripeBilling(
  config: StripeSettings,
  connection: StripeConnection = { fetch: globalThis.fetch, retries: 2 }
): BillingProvider {
  const stripe = new Stripe(config.secretKey, {
    httpClient: Stripe.createFetchHttpClient(connection.fetch),
    maxNetworkRetries: connection.retries,
    timeout: timeoutMs,
    telemetry: false,
    appInfo: { name: 'zenbujapanese-account-api' }
  })

  const readSubscription = (subscriptionId: string) =>
    guarded('read a subscription', async () => {
      const readStartedAt = new Date()
      const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['latest_invoice']
      })
      return subscriptionState(subscription, readStartedAt)
    })

  const linkOf = (paymentIntent: string | null, charge: string | null) =>
    guarded('find what a payment paid for', async (): Promise<PaymentLink> => {
      const customer = charge ? idOf((await stripe.charges.retrieve(charge)).customer) : null
      if (!paymentIntent) return { invoiceId: null, subscriptionId: null, customer }
      const payments = await stripe.invoicePayments.list({
        payment: { type: 'payment_intent', payment_intent: paymentIntent },
        expand: ['data.invoice'],
        limit: 1
      })
      const invoice = payments.data[0]?.invoice
      const paid =
        typeof invoice === 'object' && invoice !== null && !invoice.deleted ? invoice : null
      return {
        invoiceId: idOf(invoice),
        subscriptionId: idOf(paid?.parent?.subscription_details?.subscription),
        customer: customer ?? idOf(paid?.customer)
      }
    })

  async function withPayments(event: Stripe.Event, base: ProviderEvent): Promise<ProviderEvent> {
    const object = event.data.object as unknown as Record<string, unknown>
    if (refundTypes.has(event.type)) {
      const refund = object as unknown as Stripe.Refund
      const link = await linkOf(idOf(refund.payment_intent), null)
      return {
        ...base,
        hints: { ...customerHint(refund.customer ?? link.customer) },
        ledger: [refundEntry(event, refund, link)]
      }
    }
    if (disputeTypes.has(event.type) || event.type === 'radar.early_fraud_warning.created') {
      const dispute = object as unknown as Stripe.Dispute | Stripe.Radar.EarlyFraudWarning
      const link = await linkOf(idOf(dispute.payment_intent), idOf(dispute.charge))
      return {
        ...base,
        hints: customerHint(link.customer),
        ledger: [disputeEntry(event, dispute, link)]
      }
    }
    return base
  }

  const refund = (paymentIntent: string, email: string | null) =>
    stripe.refunds.create(
      { payment_intent: paymentIntent, ...(email ? { instructions_email: email } : {}) },
      { idempotencyKey: `refund-unwanted-${paymentIntent}${email ? '-by-email' : ''}` }
    )

  async function refundOnce(paymentIntent: string, email: string | null) {
    try {
      try {
        await refund(paymentIntent, null)
      } catch (error) {
        const needsEmail =
          error instanceof Stripe.errors.StripeInvalidRequestError &&
          error.param === 'instructions_email'
        if (!needsEmail || email === null) throw error
        await refund(paymentIntent, email)
      }
    } catch (error) {
      if (!(error instanceof Stripe.errors.StripeInvalidRequestError)) throw error
      if (error.code === 'charge_already_refunded') return
      log('error', "stripe: couldn't refund an unwanted subscription's payment", {
        code: error.code ?? null,
        requestId: error.requestId ?? null
      })
    }
  }

  let described: { plans: WebsitePlan[]; until: number } | null = null

  async function describedPrice(price: string): Promise<WebsitePlan | null> {
    try {
      return planOf(await stripe.prices.retrieve(price, { expand: ['product'] }))
    } catch (error) {
      const refused = error instanceof Stripe.errors.StripeInvalidRequestError
      if (error instanceof Stripe.errors.StripeError && !refused) throw error
      log('error', "stripe: a price in STRIPE_PRICE_IDS can't be offered, so it's left out", {
        price,
        reason: error instanceof Error ? error.message : 'unknown'
      })
      return null
    }
  }

  async function cancelUnlessEnded(subscription: Stripe.Subscription) {
    if (!ended.has(subscription.status)) await stripe.subscriptions.cancel(subscription.id)
  }

  return {
    source: stripeSource,
    prices: config.prices,
    gracePeriodDays: config.gracePeriodDays,
    trialDays: config.trialDays,

    async describePrices() {
      if (described && Date.now() < described.until) return described.plans
      const plans = await guarded('describe the prices', async () => {
        const each = await Promise.all(config.prices.map(describedPrice))
        return each.filter((plan): plan is WebsitePlan => plan !== null)
      })
      described = { plans, until: Date.now() + (connection.plansKeptForMs ?? plansKeptForMs) }
      return plans
    },

    createCheckout: request =>
      guarded('start a checkout', async () => {
        const session = await stripe.checkout.sessions.create({
          mode: 'subscription',
          line_items: [{ price: request.price, quantity: 1 }],
          client_reference_id: request.userId,
          ...(request.customerId
            ? { customer: request.customerId }
            : { customer_email: request.email }),
          metadata: { [accountMetadataKey]: request.userId },
          subscription_data: {
            metadata: { [accountMetadataKey]: request.userId },
            ...(config.trialDays && request.firstSubscription
              ? { trial_period_days: config.trialDays }
              : {})
          },
          success_url: request.successUrl,
          cancel_url: request.cancelUrl,
          locale: request.language ?? 'auto',
          expires_at: Math.floor(Date.now() / 1000) + checkoutMinutes * 60
        })
        if (!session.url) throw new Error('Checkout answered a session without a URL')
        return { id: session.id, url: session.url }
      }),

    checkoutSession: id =>
      guarded('read a checkout', async (): Promise<CheckoutSession> => {
        const session = await stripe.checkout.sessions.retrieve(id)
        const status =
          session.status === 'open'
            ? 'open'
            : session.status === 'complete'
              ? 'complete'
              : 'expired'
        return {
          status,
          subscriptionId: idOf(session.subscription),
          createdAt: new Date(session.created * 1000)
        }
      }),

    expireCheckout: id =>
      guarded('expire a checkout', async () => {
        await stripe.checkout.sessions.expire(id)
      }),

    createPortal: (customerId, returnUrl, language) =>
      guarded('open the customer portal', async () => {
        const session = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: returnUrl,
          locale: language ?? 'auto'
        })
        return session.url
      }),

    async verifyEvent(body, signature) {
      let event: Stripe.Event
      try {
        event = stripe.webhooks.constructEvent(body, signature, config.webhookSecret)
      } catch (error) {
        if (error instanceof Stripe.errors.StripeSignatureVerificationError) return 'invalid'
        event = {} as Stripe.Event
      }
      if (!readable(event)) {
        log(
          'error',
          "stripe: an event the service can't read; the endpoint must send Snapshot events",
          {
            object: String((event as { object?: unknown }).object ?? 'none')
          }
        )
        return 'unreadable'
      }
      if (event.api_version && event.api_version !== Stripe.API_VERSION) {
        log('warn', "stripe: an event in another API version than the SDK's", {
          version: event.api_version,
          expected: Stripe.API_VERSION
        })
      }
      try {
        return await withPayments(event, providerEvent(event, readSubscription))
      } catch (error) {
        if (error instanceof BillingUnavailable) return 'retry'
        throw error
      }
    },

    cancel: subscriptionId =>
      guarded('cancel a subscription', async () =>
        cancelUnlessEnded(await stripe.subscriptions.retrieve(subscriptionId))
      ),

    refundAndCancel: subscriptionId =>
      guarded('refund and cancel a subscription', async () => {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ['latest_invoice.payments']
        })
        await cancelUnlessEnded(subscription)
        const invoice =
          typeof subscription.latest_invoice === 'object' ? subscription.latest_invoice : null
        for (const payment of invoice?.payments?.data ?? []) {
          const intent = idOf(payment.payment.payment_intent)
          if (intent && payment.status === 'paid') {
            await refundOnce(intent, invoice?.customer_email ?? null)
          }
        }
      })
  }
}
