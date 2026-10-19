import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core'
import { ledgerKinds, ledgerOutcomes } from '../domain/billing'
import { stateOrigins, subscriptionStatuses } from '../domain/subscriptions'
import { users } from './schema'

const at = (name: string) => timestamp(name, { withTimezone: true })
const accountOf = () => text('user_id').references(() => users.id, { onDelete: 'cascade' })
const keptPastTheAccount = () =>
  text('user_id').references(() => users.id, { onDelete: 'set null' })
const source = () => text('source').notNull()

export const eventOutcomes = ['received', 'applied', 'ignored'] as const

export const billingCustomers = pgTable('billing_customers', {
  userId: accountOf().primaryKey(),
  appAccountToken: uuid('app_account_token').notNull().unique().defaultRandom(),
  stripeCustomerId: text('stripe_customer_id').unique(),
  createdAt: at('created_at').notNull().defaultNow()
})

export const subscriptions = pgTable(
  'subscriptions',
  {
    source: source(),
    providerId: text('provider_id').notNull(),
    userId: keptPastTheAccount(),
    productId: text('product_id').notNull(),
    status: text('status', { enum: subscriptionStatuses }).notNull(),
    expiresAt: at('expires_at'),
    willRenew: boolean('will_renew'),
    environment: text('environment').notNull(),
    periodStartedAt: at('period_started_at').notNull(),
    stateAt: at('state_at').notNull(),
    origin: text('origin', { enum: stateOrigins }).notNull(),
    retryStartedAt: at('retry_started_at'),
    createdAt: at('created_at').notNull().defaultNow(),
    updatedAt: at('updated_at').notNull().defaultNow()
  },
  table => [
    primaryKey({ columns: [table.source, table.providerId] }),
    index('subscriptions_user_id').on(table.userId)
  ]
)

export const billingLedger = pgTable(
  'billing_ledger',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    source: source(),
    kind: text('kind', { enum: ledgerKinds }).notNull(),
    outcome: text('outcome', { enum: ledgerOutcomes }).notNull(),
    reference: text('reference').notNull(),
    userId: keptPastTheAccount(),
    subscriptionId: text('subscription_id'),
    paymentReference: text('payment_reference'),
    amountMinor: bigint('amount_minor', { mode: 'number' }),
    currency: text('currency'),
    environment: text('environment').notNull(),
    occurredAt: at('occurred_at').notNull(),
    outcomeAt: at('outcome_at').notNull(),
    recordedAt: at('recorded_at').notNull().defaultNow(),
    updatedAt: at('updated_at').notNull().defaultNow()
  },
  table => [
    uniqueIndex('billing_ledger_reference').on(table.source, table.kind, table.reference),
    index('billing_ledger_user_id').on(table.userId)
  ]
)

export const billingEvents = pgTable(
  'billing_events',
  {
    source: source(),
    eventId: text('event_id').notNull(),
    type: text('type').notNull(),
    outcome: text('outcome', { enum: eventOutcomes }).notNull().default('received'),
    userId: keptPastTheAccount(),
    receivedAt: at('received_at').notNull().defaultNow()
  },
  table => [
    primaryKey({ columns: [table.source, table.eventId] }),
    index('billing_events_user_id').on(table.userId)
  ]
)

export const billingActions = pgTable(
  'billing_actions',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    source: source(),
    subscriptionId: text('subscription_id').notNull(),
    action: text('action', { enum: ['refund_and_cancel'] }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    lastFailure: text('last_failure'),
    claimedUntil: at('claimed_until'),
    doneAt: at('done_at'),
    createdAt: at('created_at').notNull().defaultNow()
  },
  table => [
    uniqueIndex('billing_actions_once').on(table.source, table.subscriptionId, table.action),
    index('billing_actions_owed').on(table.doneAt)
  ]
)

export const deletedAccounts = pgTable('deleted_accounts', {
  userId: text('user_id').primaryKey(),
  deletedAt: at('deleted_at').notNull().defaultNow()
})
