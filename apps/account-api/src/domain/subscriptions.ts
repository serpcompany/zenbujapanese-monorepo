export type SubscriptionSource = string

export const subscriptionStatuses = [
  'active',
  'grace_period',
  'billing_retry',
  'pending',
  'paused',
  'expired',
  'revoked'
] as const
export type SubscriptionStatus = (typeof subscriptionStatuses)[number]

export const stateOrigins = ['provider', 'device'] as const
type StateOrigin = (typeof stateOrigins)[number]

export interface SubscriptionKey {
  source: SubscriptionSource
  providerId: string
}

export interface Subscription extends SubscriptionKey {
  productId: string
  status: SubscriptionStatus
  expiresAt: Date | null
  willRenew: boolean | null
  environment: string
  periodStartedAt: Date
  stateAt: Date
  origin: StateOrigin
  retryStartedAt?: Date | null
}

export interface StoredSubscription extends Subscription {
  userId: string | null
}

export type ManagedIn = 'app_store' | 'website'
export type ManagedInOf = (source: SubscriptionSource) => ManagedIn

interface RunningSubscription {
  source: SubscriptionSource
  productId: string
  status: SubscriptionStatus
  expiresAt: Date | null
  willRenew: boolean | null
  managedIn: ManagedIn
}

export interface Entitlement {
  status: SubscriptionStatus | 'none'
  active: boolean
  source: SubscriptionSource | null
  productId: string | null
  expiresAt: Date | null
  willRenew: boolean | null
  managedIn: ManagedIn | null
  canSubscribe: boolean
  running: RunningSubscription[]
}

const hour = 60 * 60 * 1000
const day = 24 * hour
export const renewalLeewayMs = 24 * hour
export const billingRetryWindowMs = 60 * day

const leewayFor = (subscription: Subscription) =>
  subscription.willRenew === true ? renewalLeewayMs : 0

export function hasAccess(subscription: Subscription, now: Date): boolean {
  const { status, expiresAt } = subscription
  if (expiresAt === null) return false
  if (status === 'active') return now.getTime() < expiresAt.getTime() + leewayFor(subscription)
  if (status === 'grace_period') return now < expiresAt
  return false
}

const retryEnds = (subscription: Subscription) =>
  (subscription.retryStartedAt ?? subscription.expiresAt ?? subscription.stateAt).getTime() +
  billingRetryWindowMs

const stillRetrying = (subscription: Subscription, now: Date) =>
  now.getTime() < retryEnds(subscription)

function effectiveStatus(subscription: Subscription, now: Date): SubscriptionStatus {
  const { status } = subscription
  if (status === 'active' && !hasAccess(subscription, now)) return 'expired'
  if (status === 'grace_period' && !hasAccess(subscription, now)) {
    return stillRetrying(subscription, now) ? 'billing_retry' : 'expired'
  }
  if (status === 'billing_retry' && !stillRetrying(subscription, now)) return 'expired'
  if (
    status === 'paused' &&
    now.getTime() >= subscription.stateAt.getTime() + billingRetryWindowMs
  ) {
    return 'expired'
  }
  return status
}

const stillAtTheStore = new Set<SubscriptionStatus>(['billing_retry', 'paused'])
const retrying = new Set<SubscriptionStatus>(['billing_retry', 'grace_period'])

const isRunning = (subscription: Subscription, now: Date) =>
  hasAccess(subscription, now) || stillAtTheStore.has(effectiveStatus(subscription, now))

export function supersedes(next: Subscription, current: Subscription | null): boolean {
  if (current === null) return true
  const period = next.periodStartedAt.getTime() - current.periodStartedAt.getTime()
  if (period !== 0) return period > 0
  if (next.origin === 'device' && current.origin === 'provider') {
    return (
      next.status === 'revoked' && current.status !== 'revoked' && next.stateAt > current.stateAt
    )
  }
  return next.stateAt >= current.stateAt
}

export function withRetryStart(
  next: Subscription,
  held: StoredSubscription | null,
  gracePeriodDays: number
): Subscription {
  if (!retrying.has(next.status)) return { ...next, retryStartedAt: null }
  const wasRetrying = held !== null && retrying.has(held.status)
  const retryStartedAt = (wasRetrying ? held.retryStartedAt : null) ?? next.stateAt
  const graceEnds = new Date(retryStartedAt.getTime() + gracePeriodDays * day)
  return next.status === 'billing_retry' && gracePeriodDays > 0 && next.stateAt < graceEnds
    ? { ...next, status: 'grace_period', expiresAt: graceEnds, retryStartedAt }
    : { ...next, retryStartedAt }
}

const latest = (one: Date | null, other: Date | null) =>
  (one?.getTime() ?? 0) - (other?.getTime() ?? 0)

function rank(subscriptions: readonly Subscription[], now: Date): Subscription | null {
  const granting = subscriptions.filter(each => hasAccess(each, now))
  if (granting.length > 0) {
    return granting.toSorted((one, other) => latest(other.expiresAt, one.expiresAt))[0] ?? null
  }
  const running = subscriptions.filter(each => isRunning(each, now))
  const pool = running.length > 0 ? running : subscriptions
  return pool.toSorted((one, other) => latest(other.stateAt, one.stateAt))[0] ?? null
}

const noEntitlement: Entitlement = {
  status: 'none',
  active: false,
  source: null,
  productId: null,
  expiresAt: null,
  willRenew: null,
  managedIn: null,
  canSubscribe: true,
  running: []
}

export function entitlementOf(
  subscriptions: readonly Subscription[],
  now: Date,
  managedIn: ManagedInOf
): Entitlement {
  const chosen = rank(subscriptions, now)
  if (chosen === null) return noEntitlement
  const running = subscriptions
    .filter(each => isRunning(each, now))
    .map(each => ({
      source: each.source,
      productId: each.productId,
      status: effectiveStatus(each, now),
      expiresAt: each.expiresAt,
      willRenew: each.willRenew,
      managedIn: managedIn(each.source)
    }))
  return {
    status: effectiveStatus(chosen, now),
    active: hasAccess(chosen, now),
    source: chosen.source,
    productId: chosen.productId,
    expiresAt: chosen.expiresAt,
    willRenew: chosen.willRenew,
    managedIn: isRunning(chosen, now) ? managedIn(chosen.source) : null,
    canSubscribe: running.length === 0,
    running
  }
}
