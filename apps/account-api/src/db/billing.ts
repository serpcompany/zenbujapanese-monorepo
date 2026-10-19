import { and, eq, sql } from 'drizzle-orm'
import type { BillingStore, BillingTransaction } from '../domain/billing'
import type { StoredSubscription, Subscription, SubscriptionKey } from '../domain/subscriptions'
import { billingCustomers, billingEvents, billingLedger, subscriptions } from './billing-schema'
import type { Drizzle } from './database'
import { users } from './schema'

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
  origin: subscriptions.origin
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

const subscriptionsOn = (db: Drizzle, userId: string): Promise<StoredSubscription[]> =>
  db.select(subscriptionColumns).from(subscriptions).where(eq(subscriptions.userId, userId))

const subscriptionFields = (subscription: Subscription) => {
  const { source, providerId, ...fields } = subscription
  return fields
}

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
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`${key.source}:${key.providerId}`}, 0))`
      )
      const [row] = await tx.select(subscriptionColumns).from(subscriptions).where(isKey(key))
      return (row as StoredSubscription | undefined) ?? null
    },

    subscriptionsOf: userId => subscriptionsOn(tx, userId),

    async saveSubscription(userId, subscription) {
      const fields = subscriptionFields(subscription)
      await tx
        .insert(subscriptions)
        .values({ ...subscription, userId })
        .onConflictDoUpdate({
          target: [subscriptions.source, subscriptions.providerId],
          set: { ...fields, userId, updatedAt: sql`now()` }
        })
    },

    async accountExists(userId) {
      const [row] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId))
      return row !== undefined
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
            outcome: sql`case when excluded.outcome = 'pending' then ${billingLedger.outcome} else excluded.outcome end`,
            userId: sql`coalesce(${billingLedger.userId}, excluded.user_id)`,
            updatedAt: sql`now()`
          }
        })
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

    transaction: work => db.transaction(tx => work(transactionOn(tx)))
  }
}
