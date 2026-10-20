import type Stripe from 'stripe'
import type { LedgerEntry, ProviderEvent, ProviderState } from '../domain/billing'
import type { SubscriptionStatus } from '../domain/subscriptions'

export const stripeSource = 'stripe'
export const accountMetadataKey = 'zenbu_account'

const fromSeconds = (value: number) => new Date(value * 1000)

type Reference = string | { id: string } | null | undefined

export const idOf = (value: Reference): string | null =>
  typeof value === 'string' ? value : (value?.id ?? null)

const environmentOf = (livemode: boolean) => (livemode ? 'live' : 'test')

const renewing = new Set<Stripe.Subscription.Status>(['active', 'trialing', 'past_due'])

function firstPaymentOutstanding(subscription: Stripe.Subscription): boolean {
  const invoice = subscription.latest_invoice
  if (typeof invoice !== 'object' || invoice === null) return false
  return (
    invoice.billing_reason === 'subscription_create' &&
    invoice.status !== 'paid' &&
    invoice.amount_due > 0
  )
}

function statusOf(
  subscription: Stripe.Subscription,
  periodEnd: Date | null
): { status: SubscriptionStatus; expiresAt: Date | null } {
  switch (subscription.status) {
    case 'active':
    case 'trialing':
      return firstPaymentOutstanding(subscription)
        ? { status: 'pending', expiresAt: null }
        : { status: 'active', expiresAt: periodEnd }
    case 'past_due':
    case 'unpaid':
      return { status: 'billing_retry', expiresAt: periodEnd }
    case 'paused':
      return { status: 'paused', expiresAt: null }
    case 'canceled':
    case 'incomplete_expired':
      return {
        status: 'expired',
        expiresAt: subscription.ended_at ? fromSeconds(subscription.ended_at) : periodEnd
      }
    default:
      return { status: 'pending', expiresAt: null }
  }
}

export function subscriptionState(
  subscription: Stripe.Subscription,
  readStartedAt: Date
): ProviderState | null {
  const item = subscription.items.data[0]
  if (item === undefined) return null
  const { status, expiresAt } = statusOf(subscription, fromSeconds(item.current_period_end))
  const account = subscription.metadata?.[accountMetadataKey]
  const customer = idOf(subscription.customer)
  return {
    subscription: {
      source: stripeSource,
      providerId: subscription.id,
      productId: item.price.id,
      status,
      expiresAt,
      willRenew:
        renewing.has(subscription.status) &&
        !subscription.cancel_at_period_end &&
        subscription.cancel_at === null,
      environment: environmentOf(subscription.livemode),
      periodStartedAt: fromSeconds(item.current_period_start),
      stateAt: readStartedAt,
      origin: 'provider'
    },
    hints: {
      ...(account ? { userId: account } : {}),
      ...(customer ? { stripeCustomerId: customer } : {})
    }
  }
}

function refundOutcome(status: string | null): LedgerEntry['outcome'] {
  if (status === 'succeeded') return 'succeeded'
  if (status === 'failed' || status === 'canceled') return 'failed'
  return 'pending'
}

function disputeOutcome(status: string): LedgerEntry['outcome'] {
  if (status === 'won' || status === 'warning_closed' || status === 'prevented') return 'won'
  if (status === 'lost') return 'lost'
  return 'open'
}

export const customerHint = (customer: Reference) => {
  const id = idOf(customer)
  return id ? { stripeCustomerId: id } : {}
}

type Read = (subscriptionId: string) => Promise<ProviderState | null>

const checkoutTypes = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed'
])
const subscriptionTypes = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed'
])

export function providerEvent(event: Stripe.Event, read: Read): ProviderEvent {
  const base: ProviderEvent = {
    source: stripeSource,
    id: event.id,
    type: event.type,
    subscription: null,
    ledger: [],
    hints: {},
    startsSubscription: false
  }
  const track = (id: string | null) =>
    id ? { key: { source: stripeSource, providerId: id }, read: () => read(id) } : null
  const environment = environmentOf(event.livemode)
  const at = fromSeconds(event.created)
  const object = event.data.object as unknown as Record<string, unknown>
  if (checkoutTypes.has(event.type)) {
    const session = object as unknown as Stripe.Checkout.Session
    if (session.mode !== 'subscription') return base
    return {
      ...base,
      subscription: track(idOf(session.subscription)),
      hints: {
        ...(session.client_reference_id ? { userId: session.client_reference_id } : {}),
        ...customerHint(session.customer)
      },
      startsSubscription: event.type !== 'checkout.session.async_payment_failed'
    }
  }
  if (subscriptionTypes.has(event.type)) {
    const subscription = object as unknown as Stripe.Subscription
    return {
      ...base,
      subscription: track(subscription.id),
      hints: customerHint(subscription.customer)
    }
  }
  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
    const invoice = object as unknown as Stripe.Invoice
    const subscriptionId = idOf(invoice.parent?.subscription_details?.subscription)
    const paid = event.type === 'invoice.paid'
    return {
      ...base,
      subscription: track(subscriptionId),
      hints: customerHint(invoice.customer),
      ledger: [
        {
          source: stripeSource,
          kind: 'charge',
          outcome: paid ? 'succeeded' : 'failed',
          reference: paid ? invoice.id : `${invoice.id}:${event.id}`,
          subscriptionId,
          paymentReference: null,
          amountMinor: paid ? invoice.amount_paid : invoice.amount_due,
          currency: invoice.currency,
          environment,
          occurredAt: at,
          outcomeAt: at
        }
      ]
    }
  }
  return base
}

export interface PaymentLink {
  invoiceId: string | null
  subscriptionId: string | null
  customer: string | null
}

export function refundEntry(
  event: Stripe.Event,
  refund: Stripe.Refund,
  link: PaymentLink
): LedgerEntry {
  return {
    source: stripeSource,
    kind: 'refund',
    outcome: event.type === 'refund.failed' ? 'failed' : refundOutcome(refund.status),
    reference: refund.id,
    subscriptionId: link.subscriptionId,
    paymentReference: link.invoiceId ?? idOf(refund.payment_intent) ?? idOf(refund.charge),
    amountMinor: refund.amount,
    currency: refund.currency,
    environment: environmentOf(event.livemode),
    occurredAt: fromSeconds(refund.created),
    outcomeAt: fromSeconds(event.created)
  }
}

export function disputeEntry(
  event: Stripe.Event,
  dispute: Stripe.Dispute | Stripe.Radar.EarlyFraudWarning,
  link: PaymentLink
): LedgerEntry {
  const isDispute = dispute.object === 'dispute'
  return {
    source: stripeSource,
    kind: isDispute ? 'dispute' : 'fraud_warning',
    outcome: isDispute ? disputeOutcome(dispute.status) : 'open',
    reference: dispute.id,
    subscriptionId: link.subscriptionId,
    paymentReference: link.invoiceId ?? idOf(dispute.payment_intent) ?? idOf(dispute.charge),
    amountMinor: isDispute ? dispute.amount : null,
    currency: isDispute ? dispute.currency : null,
    environment: environmentOf(event.livemode),
    occurredAt: fromSeconds(dispute.created),
    outcomeAt: fromSeconds(event.created)
  }
}
