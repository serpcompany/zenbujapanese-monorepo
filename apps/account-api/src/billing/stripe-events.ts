import type Stripe from 'stripe'
import type { LedgerEntry, ProviderEvent, ProviderState } from '../domain/billing'
import type { SubscriptionStatus } from '../domain/subscriptions'

export const accountMetadataKey = 'zenbu_account'

const dayMs = 24 * 60 * 60 * 1000
const fromSeconds = (value: number) => new Date(value * 1000)

type Reference = string | { id: string } | null | undefined

export const idOf = (value: Reference): string | null =>
  typeof value === 'string' ? value : (value?.id ?? null)

const environmentOf = (livemode: boolean) => (livemode ? 'live' : 'test')

const renewing = new Set<Stripe.Subscription.Status>(['active', 'trialing', 'past_due'])

function statusOf(
  subscription: Stripe.Subscription,
  periodStart: Date,
  periodEnd: Date | null,
  gracePeriodDays: number,
  now: Date
): { status: SubscriptionStatus; expiresAt: Date | null } {
  switch (subscription.status) {
    case 'active':
    case 'trialing':
      return { status: 'active', expiresAt: periodEnd }
    case 'past_due': {
      const graceEnd = new Date(periodStart.getTime() + gracePeriodDays * dayMs)
      return gracePeriodDays > 0 && now < graceEnd
        ? { status: 'grace_period', expiresAt: graceEnd }
        : { status: 'billing_retry', expiresAt: periodEnd }
    }
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
  gracePeriodDays: number,
  now: Date
): ProviderState | null {
  const item = subscription.items.data[0]
  if (item === undefined) return null
  const periodStartedAt = fromSeconds(item.current_period_start)
  const periodEnd = fromSeconds(item.current_period_end)
  const { status, expiresAt } = statusOf(
    subscription,
    periodStartedAt,
    periodEnd,
    gracePeriodDays,
    now
  )
  const account = subscription.metadata?.[accountMetadataKey]
  const customer = idOf(subscription.customer)
  return {
    subscription: {
      source: 'stripe',
      providerId: subscription.id,
      productId: item.price.id,
      status,
      expiresAt,
      willRenew:
        renewing.has(subscription.status) &&
        !subscription.cancel_at_period_end &&
        subscription.cancel_at === null,
      environment: environmentOf(subscription.livemode),
      periodStartedAt,
      stateAt: now,
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

const customerHint = (customer: Reference) => {
  const id = idOf(customer)
  return id ? { stripeCustomerId: id } : {}
}

type Read = (subscriptionId: string) => Promise<ProviderState | null>

export function providerEvent(event: Stripe.Event, read: Read): ProviderEvent {
  const base: ProviderEvent = {
    source: 'stripe',
    id: event.id,
    type: event.type,
    subscription: null,
    ledger: [],
    hints: {},
    startsSubscription: false
  }
  const track = (id: string | null) =>
    id ? { key: { source: 'stripe' as const, providerId: id }, read: () => read(id) } : null
  const environment = environmentOf(event.livemode)
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      if (session.mode !== 'subscription') return base
      return {
        ...base,
        subscription: track(idOf(session.subscription)),
        hints: {
          ...(session.client_reference_id ? { userId: session.client_reference_id } : {}),
          ...customerHint(session.customer)
        },
        startsSubscription: true
      }
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed': {
      const subscription = event.data.object
      return {
        ...base,
        subscription: track(subscription.id),
        hints: customerHint(subscription.customer)
      }
    }
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const invoice = event.data.object
      const subscriptionId = idOf(invoice.parent?.subscription_details?.subscription)
      const paid = event.type === 'invoice.paid'
      return {
        ...base,
        subscription: track(subscriptionId),
        hints: customerHint(invoice.customer),
        ledger: [
          {
            source: 'stripe',
            kind: 'charge',
            outcome: paid ? 'succeeded' : 'failed',
            reference: `${invoice.id}:${invoice.attempt_count}`,
            subscriptionId,
            amountMinor: paid ? invoice.amount_paid : invoice.amount_due,
            currency: invoice.currency,
            environment,
            occurredAt: fromSeconds(event.created)
          }
        ]
      }
    }
    case 'refund.created':
    case 'refund.updated':
    case 'refund.failed': {
      const refund = event.data.object
      return {
        ...base,
        hints: customerHint(refund.customer),
        ledger: [
          {
            source: 'stripe',
            kind: 'refund',
            outcome: event.type === 'refund.failed' ? 'failed' : refundOutcome(refund.status),
            reference: refund.id,
            subscriptionId: null,
            amountMinor: refund.amount,
            currency: refund.currency,
            environment,
            occurredAt: fromSeconds(refund.created)
          }
        ]
      }
    }
    default:
      return base
  }
}
