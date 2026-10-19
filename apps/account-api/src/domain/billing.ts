import type { Language } from '../language'
import type {
  StoredSubscription,
  Subscription,
  SubscriptionKey,
  SubscriptionSource
} from './subscriptions'

export const ledgerKinds = ['charge', 'refund', 'dispute', 'fraud_warning'] as const
export const ledgerOutcomes = [
  'succeeded',
  'failed',
  'pending',
  'reversed',
  'open',
  'won',
  'lost'
] as const

export interface LedgerEntry {
  source: SubscriptionSource
  kind: (typeof ledgerKinds)[number]
  outcome: (typeof ledgerOutcomes)[number]
  reference: string
  subscriptionId: string | null
  paymentReference: string | null
  amountMinor: number | null
  currency: string | null
  environment: string
  occurredAt: Date
  outcomeAt: Date
}

export interface AccountHints {
  userId?: string
  appAccountToken?: string
  stripeCustomerId?: string
}

export interface ProviderState {
  subscription: Subscription
  hints: AccountHints
}

export interface ProviderEvent {
  source: SubscriptionSource
  id: string
  type: string
  subscription: { key: SubscriptionKey; read(): Promise<ProviderState | null> } | null
  ledger: readonly LedgerEntry[]
  hints: AccountHints
  startsSubscription: boolean
}

export type Verified<T> = T | 'invalid' | 'unreadable' | 'retry'

interface CheckoutRequest {
  userId: string
  email: string
  customerId: string | null
  price: string
  successUrl: string
  cancelUrl: string
  language: Language | null
  firstSubscription: boolean
}

export interface BillingProvider {
  source: SubscriptionSource
  prices: readonly string[]
  gracePeriodDays: number
  createCheckout(request: CheckoutRequest): Promise<string>
  createPortal(customerId: string, returnUrl: string, language: Language | null): Promise<string>
  verifyEvent(body: string, signature: string): Promise<Verified<ProviderEvent>>
  cancel(subscriptionId: string): Promise<void>
  refundAndCancel(subscriptionId: string): Promise<void>
}

export interface DeviceTransaction {
  state: ProviderState
  ledger: readonly LedgerEntry[]
}

export interface StoreBilling {
  source: SubscriptionSource
  products: readonly string[]
  verifyNotification(body: string): Promise<Verified<ProviderEvent>>
  verifyTransaction(signedTransaction: string): Promise<Verified<DeviceTransaction>>
  recentNotifications(): Promise<string[]>
}

interface BillingCustomer {
  appAccountToken: string
  stripeCustomerId: string | null
}

export type EventOutcome = 'applied' | 'ignored'

interface OwedAction {
  id: number
  source: SubscriptionSource
  subscriptionId: string
}

export interface BillingTransaction {
  recordEvent(source: SubscriptionSource, id: string, type: string): Promise<boolean>
  settleEvent(
    source: SubscriptionSource,
    id: string,
    outcome: EventOutcome,
    userId: string | null
  ): Promise<void>
  lockSubscription(key: SubscriptionKey): Promise<StoredSubscription | null>
  subscriptionsOf(userId: string): Promise<StoredSubscription[]>
  lockAccount(userId: string): Promise<void>
  saveSubscription(userId: string, subscription: Subscription): Promise<void>
  assignSubscription(key: SubscriptionKey, userId: string): Promise<void>
  accountExists(userId: string): Promise<boolean>
  accountWasDeleted(userId: string): Promise<boolean>
  accountByToken(appAccountToken: string): Promise<string | null>
  accountByCustomer(stripeCustomerId: string): Promise<string | null>
  linkCustomer(userId: string, stripeCustomerId: string): Promise<void>
  record(entry: LedgerEntry, userId: string | null): Promise<void>
  oweRefundAndCancel(key: SubscriptionKey): Promise<void>
  isBeingEnded(key: SubscriptionKey): Promise<boolean>
}

export interface BillingStore {
  account(userId: string): Promise<{ email: string; madeAt: Date } | null>
  ensureCustomer(userId: string): Promise<BillingCustomer | null>
  subscriptionsOf(userId: string): Promise<StoredSubscription[]>
  eventRecorded(source: SubscriptionSource, id: string): Promise<boolean>
  transaction<T>(work: (tx: BillingTransaction) => Promise<T>): Promise<T>
  claimOwedActions(limit: number): Promise<OwedAction[]>
  settleOwedAction(id: number, failure: string | null): Promise<void>
}

export class BillingUnavailable extends Error {}
