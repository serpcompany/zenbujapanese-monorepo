import {
  AutoRenewStatus,
  InAppOwnershipType,
  type JWSRenewalInfoDecodedPayload,
  type JWSTransactionDecodedPayload,
  NotificationTypeV2,
  RevocationType,
  Status
} from '@apple/app-store-server-library'
import type { LedgerEntry, ProviderState } from '../domain/billing'
import type { Subscription, SubscriptionStatus } from '../domain/subscriptions'

export interface AppleTransaction extends JWSTransactionDecodedPayload {
  originalTransactionId: string
  transactionId: string
  productId: string
  purchaseDate: number
  environment: string
}

const autoRenewable = 'Auto-Renewable Subscription'
const milliunits = 1000

export function isSubscriptionTransaction(
  transaction: JWSTransactionDecodedPayload
): transaction is AppleTransaction {
  return (
    transaction.type === autoRenewable &&
    typeof transaction.originalTransactionId === 'string' &&
    typeof transaction.transactionId === 'string' &&
    typeof transaction.productId === 'string' &&
    typeof transaction.purchaseDate === 'number' &&
    typeof transaction.environment === 'string'
  )
}

const dateOf = (millis: number | undefined) => (millis === undefined ? null : new Date(millis))

const later = (millis: number | undefined, at: Date) =>
  millis !== undefined && millis > at.getTime()

function derivedStatus(
  transaction: AppleTransaction,
  renewal: JWSRenewalInfoDecodedPayload | null,
  at: Date
): SubscriptionStatus {
  if (later(transaction.expiresDate, at)) return 'active'
  if (renewal?.isInBillingRetryPeriod) {
    return later(renewal.gracePeriodExpiresDate, at) ? 'grace_period' : 'billing_retry'
  }
  return 'expired'
}

const statusFor: Partial<Record<number, SubscriptionStatus>> = {
  [Status.ACTIVE]: 'active',
  [Status.EXPIRED]: 'expired',
  [Status.BILLING_RETRY]: 'billing_retry',
  [Status.BILLING_GRACE_PERIOD]: 'grace_period',
  [Status.REVOKED]: 'revoked'
}

function statusOf(
  transaction: AppleTransaction,
  renewal: JWSRenewalInfoDecodedPayload | null,
  reported: number | undefined,
  at: Date
): SubscriptionStatus {
  if (transaction.revocationDate !== undefined) return 'revoked'
  return (
    (reported === undefined ? undefined : statusFor[reported]) ??
    derivedStatus(transaction, renewal, at)
  )
}

export interface AppleStateInput {
  transaction: AppleTransaction
  renewal: JWSRenewalInfoDecodedPayload | null
  reportedStatus: number | undefined
  stateAt: Date
  origin: Subscription['origin']
}

export function appleState(input: AppleStateInput): ProviderState {
  const { transaction, renewal, reportedStatus, stateAt, origin } = input
  const status = statusOf(transaction, renewal, reportedStatus, stateAt)
  const expiresAt =
    status === 'grace_period'
      ? dateOf(renewal?.gracePeriodExpiresDate ?? transaction.expiresDate)
      : status === 'revoked'
        ? dateOf(transaction.revocationDate)
        : dateOf(transaction.expiresDate)
  const token = transaction.appAccountToken ?? renewal?.appAccountToken
  return {
    subscription: {
      source: 'apple',
      providerId: transaction.originalTransactionId,
      productId: transaction.productId,
      status,
      expiresAt,
      willRenew: renewal ? renewal.autoRenewStatus === AutoRenewStatus.ON : null,
      environment: transaction.environment,
      periodStartedAt: new Date(transaction.purchaseDate),
      stateAt,
      origin
    },
    hints: token ? { appAccountToken: token } : {}
  }
}

export function minorUnits(milli: number | undefined, currency: string | undefined) {
  if (milli === undefined || currency === undefined) return null
  try {
    const digits =
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    return Math.round(milli / (milliunits / 10 ** digits))
  } catch {
    return null
  }
}

export function appleLedger(
  transaction: AppleTransaction,
  notificationType: string | undefined
): LedgerEntry[] {
  if (transaction.inAppOwnershipType === InAppOwnershipType.FAMILY_SHARED) return []
  const paid = minorUnits(transaction.price, transaction.currency)
  const entry = {
    source: 'apple' as const,
    subscriptionId: transaction.originalTransactionId,
    currency: transaction.currency ?? null,
    environment: transaction.environment,
    reference: transaction.transactionId
  }
  const entries: LedgerEntry[] = [
    {
      ...entry,
      kind: 'charge',
      outcome: 'succeeded',
      amountMinor: paid,
      occurredAt: new Date(transaction.purchaseDate)
    }
  ]
  const refunded = transaction.revocationDate !== undefined
  const reversed = notificationType === NotificationTypeV2.REFUND_REVERSED
  if ((refunded && transaction.revocationType !== RevocationType.FAMILY_REVOKE) || reversed) {
    const share = transaction.revocationPercentage
    entries.push({
      ...entry,
      kind: 'refund',
      outcome: reversed ? 'reversed' : 'succeeded',
      amountMinor:
        paid === null || share === undefined ? paid : Math.round((paid * share) / 100_000),
      occurredAt: new Date(transaction.revocationDate ?? transaction.signedDate ?? Date.now())
    })
  }
  return entries
}
