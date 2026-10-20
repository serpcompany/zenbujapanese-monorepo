import { and, inArray, lt, sql } from 'drizzle-orm'
import {
  billingActions,
  billingEvents,
  billingLedger,
  deletedAccounts,
  subscriptions
} from './billing-schema'
import type { Drizzle } from './database'
import { rateLimits, sessions, verifications } from './schema'

const day = 24 * 60 * 60 * 1000

export const billingRecordsKeptYears = 7

const keptUntil = sql`now() - make_interval(years => ${billingRecordsKeptYears})`

async function purgeOldBillingRecords(db: Drizzle) {
  await db.delete(billingLedger).where(lt(billingLedger.outcomeAt, keptUntil))
  await db.delete(billingEvents).where(lt(billingEvents.receivedAt, keptUntil))
  await db.delete(billingActions).where(lt(billingActions.doneAt, keptUntil))
  await db
    .delete(subscriptions)
    .where(
      and(
        inArray(subscriptions.status, ['expired', 'revoked']),
        lt(subscriptions.stateAt, keptUntil)
      )
    )
  await db.delete(deletedAccounts).where(lt(deletedAccounts.deletedAt, keptUntil))
}

export async function purgeExpired(db: Drizzle): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, sql`now()`))
  await db.delete(verifications).where(lt(verifications.expiresAt, sql`now()`))
  await db.delete(rateLimits).where(lt(rateLimits.lastRequest, Date.now() - day))
  await purgeOldBillingRecords(db)
}
