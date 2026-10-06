import { sql } from 'drizzle-orm'
import type { EntityType } from '../domain/store'
import type { Drizzle } from './database'
import { syncOrigin, users } from './schema'

export const restoreGap = { journal: 1_000_000_000, versions: 1_000_000 }

export type DatabaseStart = 'first start' | 'same database' | 'restored'

const thisDatabase = sql<number>`(select oid::bigint from pg_database where datname = current_database())`
const profile: EntityType = 'profile'

export function fenceIfRestored(db: Drizzle): Promise<DatabaseStart> {
  return db.transaction(async tx => {
    const [origin] = await tx
      .select({ same: sql<boolean>`${syncOrigin.databaseOid} = ${thisDatabase}` })
      .from(syncOrigin)
      .for('update')
    if (!origin) {
      await tx.insert(syncOrigin).values({ databaseOid: thisDatabase }).onConflictDoNothing()
      return 'first start'
    }
    if (origin.same) return 'same database'
    await tx.execute(
      sql`select setval(pg_get_serial_sequence('sync_changes', 'sequence'), (select coalesce(max(sequence), 0) from sync_changes) + ${restoreGap.journal})`
    )
    await tx.update(users).set({ version: sql`${users.version} + ${restoreGap.versions}` })
    await tx.execute(
      sql`insert into sync_changes (user_id, entity_type, entity_id, entity_version, operation) select id, ${profile}, id, version, 'update' from users order by created_at, id`
    )
    await tx.update(syncOrigin).set({ databaseOid: thisDatabase })
    return 'restored'
  })
}
