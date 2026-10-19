import { and, asc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import type { BillingStore, BillingTransaction } from '../domain/billing'
import type { StoredSubscription, Subscription, SubscriptionKey } from '../domain/subscriptions'
import {
  billingActions,
  billingCustomers,
  billingEvents,
  billingLedger,
  deletedAccounts,
  subscriptions
} from './billing-schema'
import type { Drizzle } from './database'
import { users } from './schema'

const claimMinutes = 5
export const mostOwedAttempts = 48
const retryMinutes = 5

const subscriptionColumns = {
  source: subscriptions.source,
  providerId: subscriptions.providerId,
  userId: subscriptions.userId,
  productId: subscriptions.productId,
  status: subscriptions.status,
  expiresAt: subscriptions.expiresAt,
  willRenew: subscriptions.willRenew,
  environment: subscriptions.environment,
  periodStartedAt: subscriptions.periodStartedAt,
  stateAt: subscriptions.stateAt,
  origin: subscriptions.origin,
  retryStartedAt: subscriptions.retryStartedAt
}

const customerColumns = {
  appAccountToken: billingCustomers.appAccountToken,
  stripeCustomerId: billingCustomers.stripeCustomerId
}

const isKey = ({ source, providerId }: SubscriptionKey) =>
  and(eq(subscriptions.source, source), eq(subscriptions.providerId, providerId))

async function userWhere(
  db: Drizzle,
  column: 'appAccountToken' | 'stripeCustomerId',
  value: string
) {
  const [row] = await db
    .select({ userId: billingCustomers.userId })
    .from(billingCustomers)
    .where(eq(billingCustomers[column], value))
  return row?.userId ?? null
}

const lockFor = async (tx: Drizzle, name: string) => {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${name}, 0))`)
}

const subscriptionsOn = (db: Drizzle, userId: string): Promise<StoredSubscription[]> =>
  db.select(subscriptionColumns).from(subscriptions).where(eq(subscriptions.userId, userId))

const subscriptionFields = (subscription: Subscription) => {
  const { source, providerId, ...fields } = subscription
  return { ...fields, retryStartedAt: subscription.retryStartedAt ?? null }
}

const keptOutcome = sql`case
  when excluded.outcome = 'pending' then ${billingLedger.outcome}
  when ${billingLedger.kind} = 'charge' and ${billingLedger.outcome} = 'succeeded' then ${billingLedger.outcome}
  when excluded.outcome_at < ${billingLedger.outcomeAt} then ${billingLedger.outcome}
  else excluded.outcome end`

function transactionOn(tx: Drizzle): BillingTransaction {
  return {
    async recordEvent(source, eventId, type) {
      const inserted = await tx
        .insert(billingEvents)
        .values({ source, eventId, type })
        .onConflictDoNothing()
        .returning({ eventId: billingEvents.eventId })
      return inserted.length > 0
    },

    async settleEvent(source, eventId, outcome, userId) {
      await tx
        .update(billingEvents)
        .set({ outcome, userId })
        .where(and(eq(billingEvents.source, source), eq(billingEvents.eventId, eventId)))
    },

    async lockSubscription(key) {
      await lockFor(tx, `${key.source}:${key.providerId}`)
      const [row] = await tx.select(subscriptionColumns).from(subscriptions).where(isKey(key))
      return row ?? null
    },

    subscriptionsOf: userId => subscriptionsOn(tx, userId),

    lockAccount: userId => lockFor(tx, `account:${userId}`),

    async saveSubscription(userId, subscription) {
      const fields = subscriptionFields(subscription)
      await tx
        .insert(subscriptions)
        .values({
          source: subscription.source,
          providerId: subscription.providerId,
          ...fields,
          userId
        })
        .onConflictDoUpdate({
          target: [subscriptions.source, subscriptions.providerId],
          set: { ...fields, userId, updatedAt: sql`now()` }
        })
    },

    async assignSubscription(key, userId) {
      await tx.update(subscriptions).set({ userId, updatedAt: sql`now()` }).where(isKey(key))
    },

    async accountExists(userId) {
      const [row] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId))
      return row !== undefined
    },

    async emailOf(userId) {
      const [row] = await tx.select({ email: users.email }).from(users).where(eq(users.id, userId))
      return row?.email ?? null
    },

    async accountDeletedAt(userId) {
      const [row] = await tx
        .select({ deletedAt: deletedAccounts.deletedAt })
        .from(deletedAccounts)
        .where(eq(deletedAccounts.userId, userId))
      return row?.deletedAt ?? null
    },

    accountByToken: token =>
      /^[0-9a-f-]{36}$/i.test(token)
        ? userWhere(tx, 'appAccountToken', token.toLowerCase())
        : Promise.resolve(null),

    accountByCustomer: customerId => userWhere(tx, 'stripeCustomerId', customerId),

    async linkCustomer(userId, stripeCustomerId) {
      await tx
        .insert(billingCustomers)
        .values({ userId, stripeCustomerId })
        .onConflictDoUpdate({
          target: billingCustomers.userId,
          set: {
            stripeCustomerId: sql`coalesce(${billingCustomers.stripeCustomerId}, excluded.stripe_customer_id)`
          }
        })
    },

    async record(entry, userId) {
      await tx
        .insert(billingLedger)
        .values({ ...entry, userId })
        .onConflictDoUpdate({
          target: [billingLedger.source, billingLedger.kind, billingLedger.reference],
          set: {
            outcome: keptOutcome,
            outcomeAt: sql`greatest(${billingLedger.outcomeAt}, excluded.outcome_at)`,
            userId: sql`coalesce(${billingLedger.userId}, excluded.user_id)`,
            subscriptionId: sql`coalesce(${billingLedger.subscriptionId}, excluded.subscription_id)`,
            paymentReference: sql`coalesce(${billingLedger.paymentReference}, excluded.payment_reference)`,
            updatedAt: sql`now()`
          }
        })
    },

    async isBeingEnded(key) {
      const [row] = await tx
        .select({ id: billingActions.id })
        .from(billingActions)
        .where(
          and(
            eq(billingActions.source, key.source),
            eq(billingActions.subscriptionId, key.providerId)
          )
        )
      return row !== undefined
    },

    async oweRefundAndCancel(key) {
      await tx
        .insert(billingActions)
        .values({ source: key.source, subscriptionId: key.providerId, action: 'refund_and_cancel' })
        .onConflictDoNothing()
    }
  }
}

export function billingStore(db: Drizzle): BillingStore {
  return {
    async account(userId) {
      const [row] = await db
        .select({ email: users.email, madeAt: users.createdAt })
        .from(users)
        .where(eq(users.id, userId))
      return row ?? null
    },

    async ensureCustomer(userId) {
      await db.execute(
        sql`insert into ${billingCustomers} (user_id) select ${users.id} from ${users} where ${users.id} = ${userId} on conflict do nothing`
      )
      const [row] = await db
        .select(customerColumns)
        .from(billingCustomers)
        .where(eq(billingCustomers.userId, userId))
      return row ?? null
    },

    subscriptionsOf: userId => subscriptionsOn(db, userId),

    async eventRecorded(source, eventId) {
      const [row] = await db
        .select({ eventId: billingEvents.eventId })
        .from(billingEvents)
        .where(and(eq(billingEvents.source, source), eq(billingEvents.eventId, eventId)))
      return row !== undefined
    },

    transaction: work => db.transaction(tx => work(transactionOn(tx))),

    async claimOwedAction() {
      const owed = db
        .select({ id: billingActions.id })
        .from(billingActions)
        .where(
          and(
            isNull(billingActions.doneAt),
            or(isNull(billingActions.claimedUntil), lt(billingActions.claimedUntil, sql`now()`))
          )
        )
        .orderBy(asc(billingActions.id))
        .limit(1)
        .for('update', { skipLocked: true })
      const [claimed] = await db
        .update(billingActions)
        .set({
          claimedUntil: sql`now() + make_interval(mins => ${claimMinutes})`,
          attempts: sql`${billingActions.attempts} + 1`
        })
        .where(inArray(billingActions.id, owed))
        .returning({
          id: billingActions.id,
          source: billingActions.source,
          subscriptionId: billingActions.subscriptionId,
          attempts: billingActions.attempts
        })
      return claimed ?? null
    },

    async settleOwedAction(id, failure) {
      if (failure === null) {
        await db
          .update(billingActions)
          .set({ doneAt: sql`now()`, claimedUntil: null, lastFailure: null })
          .where(eq(billingActions.id, id))
        return 'settled'
      }
      const givesUp = sql`${billingActions.attempts} >= ${mostOwedAttempts}`
      const [settled] = await db
        .update(billingActions)
        .set({
          lastFailure: failure.slice(0, 500),
          claimedUntil: sql`case when ${givesUp} then null else now() + make_interval(mins => ${retryMinutes}) end`,
          doneAt: sql`case when ${givesUp} then now() end`
        })
        .where(eq(billingActions.id, id))
        .returning({ doneAt: billingActions.doneAt })
      return settled?.doneAt ? 'gave_up' : 'retry'
    }
  }
}
