import { log } from '@zenbu/node-service/log'
import Stripe from 'stripe'
import type { StripeSettings } from '../billing-config'
import { type BillingProvider, BillingUnavailable } from '../domain/billing'
import { accountMetadataKey, idOf, providerEvent, subscriptionState } from './stripe-events'

export interface StripeConnection {
  fetch: typeof globalThis.fetch
  retries: number
}

const timeoutMs = 10_000
const ended = new Set<Stripe.Subscription.Status>(['canceled', 'incomplete_expired'])

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
    guarded('read a subscription', async () =>
      subscriptionState(
        await stripe.subscriptions.retrieve(subscriptionId),
        config.gracePeriodDays,
        new Date()
      )
    )

  async function refundOnce(paymentIntent: string) {
    try {
      await stripe.refunds.create(
        { payment_intent: paymentIntent },
        { idempotencyKey: `refund-unwanted-${paymentIntent}` }
      )
    } catch (error) {
      const refunded =
        error instanceof Stripe.errors.StripeInvalidRequestError &&
        error.code === 'charge_already_refunded'
      if (!refunded) throw error
    }
  }

  async function cancelUnlessEnded(subscription: Stripe.Subscription) {
    if (!ended.has(subscription.status)) await stripe.subscriptions.cancel(subscription.id)
  }

  return {
    prices: config.prices,

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
            ...(config.trialDays ? { trial_period_days: config.trialDays } : {})
          },
          success_url: request.successUrl,
          cancel_url: request.cancelUrl,
          locale: request.language ?? 'auto'
        })
        if (!session.url) throw new Error('Checkout answered a session without a URL')
        return session.url
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
      } catch {
        return 'invalid'
      }
      return providerEvent(event, readSubscription)
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
        const invoice = subscription.latest_invoice
        const payments = typeof invoice === 'object' && invoice ? invoice.payments?.data : []
        for (const payment of payments ?? []) {
          const intent = idOf(payment.payment.payment_intent)
          if (intent && payment.status === 'paid') await refundOnce(intent)
        }
        await cancelUnlessEnded(subscription)
      })
  }
}
