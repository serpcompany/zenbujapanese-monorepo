import { eq } from 'drizzle-orm'
import type { Drizzle } from './database'
import { verifications } from './schema'

export interface TakenVerification {
  value: string
  expiresAt: Date
}

export async function takeVerification(
  db: Drizzle,
  identifier: string
): Promise<TakenVerification | null> {
  const [taken] = await db
    .delete(verifications)
    .where(eq(verifications.identifier, identifier))
    .returning({ value: verifications.value, expiresAt: verifications.expiresAt })
  return taken ?? null
}
