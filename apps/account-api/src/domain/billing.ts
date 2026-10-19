import type { Language } from '../language'
import type {
  StoredSubscription,
  Subscription,
  SubscriptionKey,
  SubscriptionSource
} from './subscriptions'

export const ledgerKinds = ['charge', 'refund'] as const
export const ledgerOutcomes = ['succeeded', 'failed', 'pending', 'reversed'] as const

export interface LedgerEntry {
  source: SubscriptionSource
  kind: (typeof ledgerKinds)[number]
  outcome: (typeof ledgerOutcomes)[number]
  reference: string
  subscriptionId: string | null
  amountMinor: number | null
  currency: string | null
  environment: string
  occurredAt: Date
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

export type Verified<T> = T | 'invalid' | 'retry'

interface CheckoutRequest {
  userId: string
  email: string
  customerId: string | null
  price: string
  successUrl: string
  cancelUrl: string
  language: Language | null
}

export interface BillingProvider {
  prices: readonly string[]
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
  products: readonly string[]
  verifyNotification(body: string): Promise<Verified<ProviderEvent>>
  verifyTransaction(signedTransaction: string): Promise<Verified<DeviceTransaction>>
}

interface BillingCustomer {
  appAccountToken: string
  stripeCustomerId: string | null
}

export type EventOutcome = 'applied' | 'ignored'

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
  saveSubscription(userId: string, subscription: Subscription): Promise<void>
  accountExists(userId: string): Promise<boolean>
  accountByToken(appAccountToken: string): Promise<string | null>
  accountByCustomer(stripeCustomerId: string): Promise<string | null>
  linkCustomer(userId: string, stripeCustomerId: string): Promise<void>
  record(entry: LedgerEntry, userId: string | null): Promise<void>
}

export interface BillingStore {
  account(userId: string): Promise<{ email: string; madeAt: Date } | null>
  ensureCustomer(userId: string): Promise<BillingCustomer | null>
  subscriptionsOf(userId: string): Promise<StoredSubscription[]>
  transaction<T>(work: (tx: BillingTransaction) => Promise<T>): Promise<T>
}

export class BillingUnavailable extends Error {}
