import { log } from '@zenbu/node-service/log'
import { sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { failureFields } from '../failure'

export type Drizzle = PgDatabase<PgQueryResultHKT>

export interface Database {
  db: Drizzle
  ready(): Promise<boolean>
  close(): Promise<void>
}

export async function answers(db: Drizzle): Promise<boolean> {
  try {
    await db.execute(sql`select 1`)
    return true
  } catch (error) {
    log('warn', 'database unreachable', failureFields(error))
    return false
  }
}
