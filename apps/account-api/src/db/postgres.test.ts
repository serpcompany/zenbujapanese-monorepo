import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { migrationsFolder as migrations } from '../config'
import { createAccounts } from '../domain/accounts'
import { cursorKey, cursors } from '../domain/cursor'
import { accountStore } from './accounts'
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

  test.skipIf(realPostgres === '')(
    'lets one of many changes made at once to one account through, and applies a mutation sent many times at once once',
    async () => {
      await migratePostgres(url, migrations)
      const database = openPostgres(url)
      const raw = new pg.Client({ connectionString: url })
      await raw.connect()
      const id = `race-${randomUUID()}`
      await raw.query('insert into users (id, name, email) values ($1, $2, $3)', [
        id,
        '',
        `${id}@example.com`
      ])
      const accounts = createAccounts(accountStore(database.db), cursors(cursorKey('test')))
      const updates = await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          accounts.updateProfile(id, 1, { name: `Name ${index}` })
        )
      )
      expect(updates.map(update => update?.status).sort()).toEqual([
        ...Array(7).fill('conflict'),
        'updated'
      ])
      const mutation = {
        id: 'sent-at-once',
        entity: 'profile',
        operation: 'update',
        baseVersion: 2,
        fields: { username: id.slice(0, 30).replaceAll('-', '_') }
      }
      const answers = await Promise.all(
        Array.from({ length: 6 }, () => accounts.sync(id, { mutations: [mutation] }))
      )
      for (const answer of answers) {
        expect(answer).toMatchObject({
          status: 'synced',
          results: [{ id: 'sent-at-once', status: 'applied', version: 3 }]
        })
      }
      const journal = await raw.query(
        'select operation, entity_version::int as entity_version from sync_changes where user_id = $1 order by sequence',
        [id]
      )
      expect(journal.rows).toEqual([
        { operation: 'create', entity_version: 1 },
        { operation: 'update', entity_version: 2 },
        { operation: 'update', entity_version: 3 }
      ])
      await raw.query('delete from users where id = $1', [id])
      await raw.end()
      await database.close()
    }
  )
})
