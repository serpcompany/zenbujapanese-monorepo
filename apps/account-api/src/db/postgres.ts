import { log } from '@zenbu/node-service/log'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'
import { failureFields } from '../failure'
import { answers, type Database } from './database'

export const migrationLock = 565_011
const connectSeconds = 5
const lockWaitSeconds = 120
const tableLockTimeout = '30s'

const connection = (url: string) => ({
  connectionString: url,
  connectionTimeoutMillis: connectSeconds * 1000,
  keepAlive: true
})

async function takeMigrationLock(client: pg.Client): Promise<void> {
  const deadline = Date.now() + lockWaitSeconds * 1000
  for (;;) {
    const { rows } = await client.query<{ locked: boolean }>(
      'select pg_try_advisory_lock($1) as locked',
      [migrationLock]
    )
    if (rows[0]?.locked) return
    if (Date.now() > deadline) {
      throw new Error(
        `another start held the migration lock for over ${lockWaitSeconds} seconds; see pg_locks for the advisory lock ${migrationLock}`
      )
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
}

export async function migratePostgres(url: string, migrationsFolder: string): Promise<void> {
  const client = new pg.Client(connection(url))
  client.on('error', error => log('error', 'the migration connection failed', failureFields(error)))
  await client.connect()
  try {
    await client.query(`set lock_timeout = '${tableLockTimeout}'`)
    await takeMigrationLock(client)
    await migrate(drizzle(client), { migrationsFolder })
  } finally {
    await client.end()
  }
}

export function openPostgres(url: string): Database {
  const pool = new pg.Pool({ ...connection(url), max: 10, idleTimeoutMillis: 30_000 })
  pool.on('error', error =>
    log('error', 'an idle database connection failed', failureFields(error))
  )
  const db = drizzle(pool)
  return { ready: () => answers(db), close: () => pool.end() }
}
