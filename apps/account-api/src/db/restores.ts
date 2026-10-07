import { sql } from 'drizzle-orm'
import { listWordSeparator } from '../domain/entities'
import type { EntityType } from '../domain/store'
import type { Drizzle } from './database'
import { knownWords, listWords, syncOrigin, users, wordLists } from './schema'

export type DatabaseStart = 'first start' | 'same database' | 'restored'

const thisDatabase = sql<number>`(select oid::bigint from pg_database where datname = current_database())`
const epoch = sql`extract(epoch from clock_timestamp())`
const entity = (type: EntityType) => sql`${type}`

const versioned = [users, knownWords, wordLists, listWords] as const

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
    for (const table of versioned) {
      await tx
        .update(table)
        .set({ version: sql`greatest(${table.version} + 1, (${epoch} * 1000)::bigint)` })
    }
    await tx.execute(sql`delete from sync_changes`)
    await tx.execute(sql`
      insert into sync_changes (user_id, entity_type, entity_id, entity_version, operation)
      select id, ${entity('profile')}, id, version, 'restore' from users
      union all
      select user_id, ${entity('knownWord')}, item_id, version, 'restore' from known_words
      union all
      select user_id, ${entity('list')}, id, version, 'restore' from word_lists
      union all
      select user_id, ${entity('listWord')}, list_id || ${listWordSeparator} || item_id, version, 'restore' from list_words`)
    if (origin) {
      await tx.update(syncOrigin).set({ databaseOid: thisDatabase })
      return 'restored'
    }
    await tx.insert(syncOrigin).values({ databaseOid: thisDatabase }).onConflictDoNothing()
    return 'first start'
  })
}
