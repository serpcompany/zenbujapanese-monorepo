import type {
  AccountHints,
  BillingTransaction,
  EventOutcome,
  ProviderEvent,
  ProviderState
} from './billing'
import {
  type StoredSubscription,
  type Subscription,
  type SubscriptionKey,
  supersedes
} from './subscriptions'

export type EventAnswer = EventOutcome | 'duplicate'

export interface EventRules {
  grants(subscription: Subscription): boolean
  orphaned(key: SubscriptionKey): Promise<void>
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

async function applyState(
  tx: BillingTransaction,
  state: ProviderState,
  held: StoredSubscription | null,
  rules: EventRules
): Promise<string | null> {
  const userId = await accountFor(tx, state.hints, held)
  if (userId === null || !rules.grants(state.subscription)) return null
  await linkCustomer(tx, userId, state.hints)
  if (supersedes(state.subscription, held)) await tx.saveSubscription(userId, state.subscription)
  return userId
}

async function subscriptionOwner(
  tx: BillingTransaction,
  event: ProviderEvent,
  rules: EventRules
): Promise<string | null> {
  const update = event.subscription
  if (update === null) return null
  const held = await tx.lockSubscription(update.key)
  const state = await update.read()
  if (state === null) return held?.userId ?? null
  const hints = { ...event.hints, ...state.hints }
  const owner = await applyState(tx, { ...state, hints }, held, rules)
  const accountGone =
    event.hints.userId !== undefined && !(await tx.accountExists(event.hints.userId))
  if (
    owner === null &&
    event.startsSubscription &&
    accountGone &&
    rules.grants(state.subscription)
  ) {
    await rules.orphaned(update.key)
  }
  return owner
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
