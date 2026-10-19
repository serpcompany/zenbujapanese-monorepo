import { and, count, desc, eq, inArray, ne } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'
import type { EntityType } from '../domain/store'
import type { Drizzle } from './database'
import { syncChanges } from './schema'

interface RecentRows {
  table: PgTable
  userId: PgColumn
  id: PgColumn
  status: PgColumn
  updatedAt: PgColumn
  live: string
  entity: EntityType
}

export function recentRows(db: Drizzle, userId: string, rows: RecentRows) {
  const ofTheAccount = eq(rows.userId, userId)
  const live = and(ofTheAccount, eq(rows.status, rows.live))
  return {
    live,
    async liveCount() {
      const [row] = await db.select({ live: count() }).from(rows.table).where(live)
      return row?.live ?? 0
    },
    async forgetGone(kept: number) {
      const forgotten = await db
        .select({ id: rows.id })
        .from(rows.table)
        .where(and(ofTheAccount, ne(rows.status, rows.live)))
        .orderBy(desc(rows.updatedAt), desc(rows.id))
        .offset(kept)
      const ids = forgotten.map(row => String(row.id))
      if (ids.length === 0) return
      await db
        .delete(syncChanges)
        .where(
          and(
            eq(syncChanges.userId, userId),
            eq(syncChanges.entityType, rows.entity),
            inArray(syncChanges.entityId, ids)
          )
        )
      await db.delete(rows.table).where(and(ofTheAccount, inArray(rows.id, ids)))
    }
  }
}
