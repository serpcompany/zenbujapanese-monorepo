import type { AccountHints, BillingTransaction, EventOutcome, ProviderEvent } from './billing'
import {
  entitlementOf,
  type StoredSubscription,
  type Subscription,
  type SubscriptionKey,
  type SubscriptionStatus,
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
  const byToken = hints.appAccountToken ? await tx.accountByToken(hints.appAccountToken) : null
  if (byToken) return byToken
  if (held) return held.userId
  if (hints.userId && (await tx.accountExists(hints.userId))) return hints.userId
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

const endedAtTheStore = new Set<SubscriptionStatus>(['expired', 'revoked'])

async function anotherRuns(tx: BillingTransaction, userId: string, subscription: Subscription) {
  const others = (await tx.subscriptionsOf(userId)).filter(each => !sameKey(each, subscription))
  return !entitlementOf(others, subscription.stateAt).canSubscribe
}

async function unwanted(
  tx: BillingTransaction,
  event: ProviderEvent,
  hints: AccountHints,
  userId: string | null,
  subscription: Subscription
): Promise<boolean> {
  if (userId === null) {
    const named = hints.userId
    if (named === undefined) return false
    if (!event.startsSubscription && endedAtTheStore.has(subscription.status)) return false
    return !(await tx.accountExists(named))
  }
  if (!event.startsSubscription) return false
  await tx.lockAccount(userId)
  return anotherRuns(tx, userId, subscription)
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
  if (await unwanted(tx, event, hints, userId, state.subscription)) {
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
