import { errorFields, log } from '@zenbu/node-service/log'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'
import { answers, type Database } from './database'

const migrationLock = 565_011
const connectSeconds = 5

export async function migratePostgres(url: string, migrationsFolder: string): Promise<void> {
  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: connectSeconds * 1000
  })
  await client.connect()
  try {
    await client.query('select pg_advisory_lock($1)', [migrationLock])
    await migrate(drizzle(client), { migrationsFolder })
  } finally {
    await client.end()
  }
}

export function openPostgres(url: string): Database {
  const pool = new pg.Pool({
    connectionString: url,
    max: 10,
    connectionTimeoutMillis: connectSeconds * 1000,
    idleTimeoutMillis: 30_000
  })
  pool.on('error', error => log('error', 'an idle database connection failed', errorFields(error)))
  const db = drizzle(pool)
  return { ready: () => answers(db), close: () => pool.end() }
}
