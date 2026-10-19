export const subscriptionSources = ['apple', 'stripe'] as const
export type SubscriptionSource = (typeof subscriptionSources)[number]

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
}

export interface StoredSubscription extends Subscription {
  userId: string
}

type ManagedIn = 'app_store' | 'website'

export interface Entitlement {
  status: SubscriptionStatus | 'none'
  active: boolean
  source: SubscriptionSource | null
  productId: string | null
  expiresAt: Date | null
  willRenew: boolean | null
  managedIn: ManagedIn | null
  canSubscribe: boolean
}

const hour = 60 * 60 * 1000
export const renewalLeewayMs = 24 * hour

const managedIn: Record<SubscriptionSource, ManagedIn> = {
  apple: 'app_store',
  stripe: 'website'
}

const stillAtTheProvider = new Set<SubscriptionStatus>(['billing_retry', 'pending', 'paused'])

const leewayFor = (subscription: Subscription) =>
  subscription.willRenew === true ? renewalLeewayMs : 0

export function hasAccess(subscription: Subscription, now: Date): boolean {
  const { status, expiresAt } = subscription
  if (expiresAt === null) return false
  if (status === 'active') return now.getTime() < expiresAt.getTime() + leewayFor(subscription)
  if (status === 'grace_period') return now < expiresAt
  return false
}

function effectiveStatus(subscription: Subscription, now: Date): SubscriptionStatus {
  if (subscription.status === 'active' && !hasAccess(subscription, now)) return 'expired'
  if (subscription.status === 'grace_period' && !hasAccess(subscription, now)) {
    return 'billing_retry'
  }
  return subscription.status
}

const isLive = (subscription: Subscription, now: Date) =>
  hasAccess(subscription, now) || stillAtTheProvider.has(effectiveStatus(subscription, now))

export function supersedes(next: Subscription, current: Subscription | null): boolean {
  if (current === null) return true
  const period = next.periodStartedAt.getTime() - current.periodStartedAt.getTime()
  if (period !== 0) return period > 0
  if (next.origin === 'device' && current.origin === 'provider') {
    return next.status === 'revoked' && current.status !== 'revoked'
  }
  return next.stateAt >= current.stateAt
}

const latest = (one: Date | null, other: Date | null) =>
  (one?.getTime() ?? 0) - (other?.getTime() ?? 0)

function rank(subscriptions: readonly Subscription[], now: Date): Subscription | null {
  const granting = subscriptions.filter(each => hasAccess(each, now))
  if (granting.length > 0) {
    return granting.toSorted((one, other) => latest(other.expiresAt, one.expiresAt))[0] ?? null
  }
  const live = subscriptions.filter(each => isLive(each, now))
  const pool = live.length > 0 ? live : subscriptions
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
  canSubscribe: true
}

export function entitlementOf(subscriptions: readonly Subscription[], now: Date): Entitlement {
  const chosen = rank(subscriptions, now)
  if (chosen === null) return noEntitlement
  return {
    status: effectiveStatus(chosen, now),
    active: hasAccess(chosen, now),
    source: chosen.source,
    productId: chosen.productId,
    expiresAt: chosen.expiresAt,
    willRenew: chosen.willRenew,
    managedIn: isLive(chosen, now) ? managedIn[chosen.source] : null,
    canSubscribe: !subscriptions.some(each => isLive(each, now))
  }
}
