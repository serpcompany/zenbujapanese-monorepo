import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { migrationsFolder as migrations } from '../config'
import { migratePostgres, migrationLock, openPostgres } from './postgres'

const realPostgres = process.env.ACCOUNT_API_TEST_DATABASE_URL ?? ''
let url = realPostgres
let stop = async () => {}

beforeAll(async () => {
  if (url !== '') return
  const db = await PGlite.create()
  const server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 0, maxConnections: 10 })
  await server.start()
  url = `postgres://postgres@${server.getServerConn()}/postgres`
  stop = async () => {
    await server.stop()
    await db.close()
  }
})

afterAll(() => stop())

describe('Postgres, through the driver the service runs', () => {
  test('applies the migrations, and again with nothing left to do', async () => {
    await migratePostgres(url, migrations)
    await migratePostgres(url, migrations)
  })

  test.skipIf(realPostgres === '')(
    'waits while another start holds the migration lock, then migrates',
    async () => {
      const other = new pg.Client({ connectionString: url })
      await other.connect()
      await other.query('select pg_advisory_lock($1)', [migrationLock])
      let finished = false
      const migrating = migratePostgres(url, migrations).then(() => {
        finished = true
      })
      await new Promise(resolve => setTimeout(resolve, 2500))
      expect(finished).toBe(false)
      await other.query('select pg_advisory_unlock($1)', [migrationLock])
      await other.end()
      await vi.waitFor(() => expect(finished).toBe(true), { timeout: 10_000 })
      await migrating
    }
  )

  test('answers while the pool is open, and not after it closes', async () => {
    const database = openPostgres(url)
    expect(await database.ready()).toBe(true)
    await database.close()
    expect(await database.ready()).toBe(false)
  })
})
