import { and, count, desc, eq, inArray, not, type SQL, sql } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'
import type { EntityType } from '../domain/store'
import type { Drizzle } from './database'
import { forgottenVersions, syncChanges } from './schema'

interface KeptRows {
  table: PgTable
  userId: PgColumn
  id: PgColumn | SQL
  live: SQL
  updatedAt: PgColumn
  version: PgColumn
  entity: EntityType
  remembered?: boolean
}

const highest = (values: unknown[]) => Math.max(0, ...values.map(Number))

export function keptRows(db: Drizzle, userId: string, rows: KeptRows) {
  const ofTheAccount = eq(rows.userId, userId)
  const live = and(ofTheAccount, rows.live)
  const found = () => db.select({ id: rows.id, version: rows.version }).from(rows.table)

  async function remember(version: number, sequence: number) {
    await db
      .insert(forgottenVersions)
      .values({ userId, entityType: rows.entity, version, sequence })
      .onConflictDoUpdate({
        target: [forgottenVersions.userId, forgottenVersions.entityType],
        set: {
          version: sql`greatest(${forgottenVersions.version}, excluded.version)`,
          sequence: sql`greatest(${forgottenVersions.sequence}, excluded.sequence)`
        }
      })
  }

  async function forget(forgotten: { id: unknown; version: unknown }[]) {
    const ids = forgotten.map(row => String(row.id))
    if (ids.length === 0) return ids
    const journal = await db
      .delete(syncChanges)
      .where(
        and(
          eq(syncChanges.userId, userId),
          eq(syncChanges.entityType, rows.entity),
          inArray(syncChanges.entityId, ids)
        )
      )
      .returning({ sequence: syncChanges.sequence })
    await db.delete(rows.table).where(and(ofTheAccount, inArray(sql`${rows.id}`, ids)))
    if (rows.remembered) {
      await remember(
        highest(forgotten.map(row => row.version)),
        highest(journal.map(row => row.sequence))
      )
    }
    return ids
  }

  return {
    live,
    async liveCount() {
      const [row] = await db.select({ live: count() }).from(rows.table).where(live)
      return row?.live ?? 0
    },
    async forgetGone(kept: number, within?: SQL) {
      return forget(
        await found()
          .where(and(ofTheAccount, within, not(rows.live)))
          .orderBy(desc(rows.updatedAt), desc(rows.id))
          .offset(kept)
      )
    },
    forgetAll: async (within: SQL) => forget(await found().where(and(ofTheAccount, within)))
  }
}
