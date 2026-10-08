import { eq } from 'drizzle-orm'
import type { Drizzle } from './database'
import { verifications } from './schema'

export async function takeVerification(db: Drizzle, identifier: string): Promise<Date | null> {
  const [taken] = await db
    .delete(verifications)
    .where(eq(verifications.identifier, identifier))
    .returning({ expiresAt: verifications.expiresAt })
  return taken?.expiresAt ?? null
}
