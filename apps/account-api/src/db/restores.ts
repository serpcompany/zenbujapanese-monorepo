import { sql } from 'drizzle-orm'
import type { EntityType } from '../domain/store'
import type { Drizzle } from './database'
import { syncOrigin, users } from './schema'

export type DatabaseStart = 'first start' | 'same database' | 'restored'

const thisDatabase = sql<number>`(select oid::bigint from pg_database where datname = current_database())`
const epoch = sql`extract(epoch from clock_timestamp())`
const profile: EntityType = 'profile'

export function fenceIfRestored(db: Drizzle): Promise<DatabaseStart> {
  return db.transaction(async tx => {
    const [origin] = await tx
      .select({ same: sql<boolean>`${syncOrigin.databaseOid} = ${thisDatabase}` })
      .from(syncOrigin)
      .for('update')
    if (origin?.same) return 'same database'
    await tx.execute(
      sql`select setval(pg_get_serial_sequence('sync_changes', 'sequence'), greatest((select coalesce(max(sequence), 0) from sync_changes), (${epoch} * 1000000)::bigint))`
    )
    await tx
      .update(users)
      .set({ version: sql`greatest(${users.version} + 1, (${epoch} * 1000)::bigint)` })
    await tx.execute(sql`delete from sync_changes where entity_type = ${profile}`)
    await tx.execute(
      sql`insert into sync_changes (user_id, entity_type, entity_id, entity_version, operation) select id, ${profile}, id, version, 'update' from users order by created_at, id`
    )
    if (origin) {
      await tx.update(syncOrigin).set({ databaseOid: thisDatabase })
      return 'restored'
    }
    await tx.insert(syncOrigin).values({ databaseOid: thisDatabase }).onConflictDoNothing()
    return 'first start'
  })
}
