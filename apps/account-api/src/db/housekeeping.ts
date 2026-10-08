import { lt, sql } from 'drizzle-orm'
import type { Drizzle } from './database'
import { rateLimits, sessions, verifications } from './schema'

const day = 24 * 60 * 60 * 1000

export async function purgeExpired(db: Drizzle): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, sql`now()`))
  await db.delete(verifications).where(lt(verifications.expiresAt, sql`now()`))
  await db.delete(rateLimits).where(lt(rateLimits.lastRequest, Date.now() - day))
}
