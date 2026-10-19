import type {
  AccountHints,
  BillingTransaction,
  EventOutcome,
  ProviderEvent,
  ProviderState
} from './billing'
import {
  entitlementOf,
  type ManagedInOf,
  type StoredSubscription,
  type Subscription,
  type SubscriptionKey,
  type SubscriptionStatus,
  supersedes,
  withRetryStart
} from './subscriptions'

export type EventAnswer = EventOutcome | 'duplicate'

export interface EventRules {
  grants(subscription: Subscription): boolean
  gracePeriodDays(subscription: Subscription): number
  refundsAndCancels(key: SubscriptionKey): boolean
  managedIn: ManagedInOf
}

async function accountFor(
  tx: BillingTransaction,
  hints: AccountHints,
  held: StoredSubscription | null
): Promise<string | null> {
  const byToken = hints.appAccountToken ? await tx.accountByToken(hints.appAccountToken) : null
  if (byToken) return byToken
  if (held?.userId) return held.userId
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

async function anotherRuns(
  tx: BillingTransaction,
  userId: string,
  subscription: Subscription,
  rules: EventRules
) {
  const others: StoredSubscription[] = []
  for (const each of await tx.subscriptionsOf(userId)) {
    if (!sameKey(each, subscription) && !(await tx.isBeingEnded(each))) others.push(each)
  }
  return !entitlementOf(others, subscription.stateAt, rules.managedIn).canSubscribe
}

async function unwanted(
  tx: BillingTransaction,
  event: ProviderEvent,
  hints: AccountHints,
  userId: string | null,
  subscription: Subscription,
  rules: EventRules
): Promise<boolean> {
  if (!rules.refundsAndCancels(subscription)) return false
  if (userId === null) {
    const named = hints.userId
    if (named === undefined) return false
    if (!event.startsSubscription && endedAtTheStore.has(subscription.status)) return false
    return !(await tx.accountExists(named)) && (await tx.accountWasDeleted(named))
  }
  if (!event.startsSubscription || endedAtTheStore.has(subscription.status)) return false
  await tx.lockAccount(userId)
  return anotherRuns(tx, userId, subscription, rules)
}

async function subscriptionOwner(
  tx: BillingTransaction,
  event: ProviderEvent,
  state: ProviderState | null,
  rules: EventRules
): Promise<string | null> {
  const update = event.subscription
  if (update === null) return null
  const held = await tx.lockSubscription(update.key)
  if (state === null) return held?.userId ?? null
  if (!rules.grants(state.subscription)) return null
  const hints = { ...event.hints, ...state.hints }
  const userId = await accountFor(tx, hints, held)
  if (await unwanted(tx, event, hints, userId, state.subscription, rules)) {
    await tx.oweRefundAndCancel(update.key)
  }
  if (userId === null) return null
  await linkCustomer(tx, userId, hints)
  const next = withRetryStart(state.subscription, held, rules.gracePeriodDays(state.subscription))
  if (supersedes(next, held)) await tx.saveSubscription(userId, next)
  return userId
}

export async function applyEvent(
  tx: BillingTransaction,
  event: ProviderEvent,
  state: ProviderState | null,
  rules: EventRules
): Promise<EventAnswer> {
  if (!(await tx.recordEvent(event.source, event.id, event.type))) return 'duplicate'
  const owner = await subscriptionOwner(tx, event, state, rules)
  const userId = owner ?? (await accountFor(tx, event.hints, null))
  for (const entry of event.ledger) await tx.record(entry, userId)
  const outcome: EventOutcome =
    owner !== null || (userId !== null && event.ledger.length > 0) ? 'applied' : 'ignored'
  await tx.settleEvent(event.source, event.id, outcome, userId)
  return outcome
}
