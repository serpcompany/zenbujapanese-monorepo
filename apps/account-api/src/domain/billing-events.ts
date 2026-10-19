import type {
  AccountHints,
  BillingTransaction,
  EventOutcome,
  ProviderEvent,
  ProviderState
} from './billing'
import {
  entitlementOf,
  type StoredSubscription,
  type Subscription,
  type SubscriptionKey,
  supersedes
} from './subscriptions'

export type EventAnswer = EventOutcome | 'duplicate'

export interface EventRules {
  grants(subscription: Subscription): boolean
  refundAndCancel(key: SubscriptionKey): Promise<void>
}

async function accountFor(
  tx: BillingTransaction,
  hints: AccountHints,
  held: StoredSubscription | null
): Promise<string | null> {
  if (held) return held.userId
  if (hints.userId && (await tx.accountExists(hints.userId))) return hints.userId
  const byToken = hints.appAccountToken ? await tx.accountByToken(hints.appAccountToken) : null
  if (byToken) return byToken
  return hints.stripeCustomerId ? tx.accountByCustomer(hints.stripeCustomerId) : null
}

async function linkCustomer(tx: BillingTransaction, userId: string, hints: AccountHints) {
  const customer = hints.stripeCustomerId
  if (customer && (await tx.accountByCustomer(customer)) === null) {
    await tx.linkCustomer(userId, customer)
  }
}

const sameKey = (one: SubscriptionKey, other: SubscriptionKey) =>
  one.source === other.source && one.providerId === other.providerId

async function anotherRuns(tx: BillingTransaction, userId: string, subscription: Subscription) {
  const others = (await tx.subscriptionsOf(userId)).filter(each => !sameKey(each, subscription))
  return !entitlementOf(others, subscription.stateAt).canSubscribe
}

async function unwantedStart(
  tx: BillingTransaction,
  event: ProviderEvent,
  userId: string | null,
  subscription: Subscription
): Promise<boolean> {
  if (!event.startsSubscription) return false
  if (userId !== null) return anotherRuns(tx, userId, subscription)
  return event.hints.userId !== undefined && !(await tx.accountExists(event.hints.userId))
}

async function subscriptionOwner(
  tx: BillingTransaction,
  event: ProviderEvent,
  rules: EventRules
): Promise<string | null> {
  const update = event.subscription
  if (update === null) return null
  const held = await tx.lockSubscription(update.key)
  let state = await update.read()
  if (state === null) return held?.userId ?? null
  if (!rules.grants(state.subscription)) return null
  const hints = { ...event.hints, ...state.hints }
  const userId = await accountFor(tx, hints, held)
  if (await unwantedStart(tx, event, userId, state.subscription)) {
    await rules.refundAndCancel(update.key)
    state = (await update.read()) ?? state
  }
  if (userId === null) return null
  await linkCustomer(tx, userId, hints)
  if (supersedes(state.subscription, held)) await tx.saveSubscription(userId, state.subscription)
  return userId
}

export async function applyEvent(
  tx: BillingTransaction,
  event: ProviderEvent,
  rules: EventRules
): Promise<EventAnswer> {
  if (!(await tx.recordEvent(event.source, event.id, event.type))) return 'duplicate'
  const owner = await subscriptionOwner(tx, event, rules)
  const userId = owner ?? (await accountFor(tx, event.hints, null))
  for (const entry of event.ledger) await tx.record(entry, userId)
  const outcome: EventOutcome =
    owner !== null || (userId !== null && event.ledger.length > 0) ? 'applied' : 'ignored'
  await tx.settleEvent(event.source, event.id, outcome, userId)
  return outcome
}
