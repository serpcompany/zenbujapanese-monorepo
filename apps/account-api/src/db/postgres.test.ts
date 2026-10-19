import { createHash, randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { migrationsFolder as migrations } from '../config'
import { createAccounts } from '../domain/accounts'
import { scopes } from '../domain/clients'
import { cursorKey, cursors, searchKeys } from '../domain/cursor'
import { photoFiles } from '../domain/photo-files'
import { MemoryPhotoStorage } from '../storage/memory'
import { accountStore } from './accounts'
import { migratePostgres, migrationLock, openPostgres } from './postgres'

const everyScope = new Set(scopes)

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

async function anAccount(prefix: string) {
  await migratePostgres(url, migrations)
  const database = openPostgres(url)
  const raw = new pg.Client({ connectionString: url })
  await raw.connect()
  const id = `${prefix}-${randomUUID()}`
  await raw.query('insert into users (id, name, email) values ($1, $2, $3)', [
    id,
    '',
    `${id}@example.com`
  ])
  const done = async () => {
    await raw.query('delete from users where id = $1', [id])
    await raw.end()
    await database.close()
  }
  return { database, raw, id, done }
}

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
      await migrating
      expect(finished).toBe(true)
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
      const { database, raw, id, done } = await anAccount('race')
      const accounts = createAccounts(
        accountStore(database.db),
        cursors(cursorKey('test')),
        searchKeys('test')
      )
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
        Array.from({ length: 6 }, () => accounts.sync(id, { mutations: [mutation] }, everyScope))
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
      expect(journal.rows).toEqual([{ operation: 'update', entity_version: 3 }])
      await done()
    }
  )

  test.skipIf(realPostgres === '')(
    'keeps an account to its newest 50 videos when several are watched at once',
    async () => {
      const { database, raw, id, done } = await anAccount('watch-race')
      await raw.query(
        "insert into watched_videos (user_id, video_id, watched_at, status, version) select $1, 'race' || lpad(n::text, 7, '0'), timestamptz '2026-10-01T00:00:00Z' + n * interval '1 second', 'watched', 1 from generate_series(0, 47) as n",
        [id]
      )
      const accounts = createAccounts(
        accountStore(database.db),
        cursors(cursorKey('test')),
        searchKeys('test')
      )
      const watched = (n: number) => ({
        id: `watch-at-once-${n}`,
        entity: 'watchedVideo',
        operation: 'watch',
        entityId: `race${String(n).padStart(7, '0')}`,
        baseVersion: 0,
        fields: { watchedAt: new Date(Date.UTC(2026, 9, 1) + n * 1000).toISOString() }
      })
      const answers = await Promise.all(
        Array.from({ length: 8 }, (_, n) =>
          accounts.sync(id, { mutations: [watched(n + 48)] }, everyScope)
        )
      )
      for (const answer of answers) {
        expect(answer).toMatchObject({ status: 'synced', results: [{ status: 'applied' }] })
      }
      const kept = await raw.query(
        "select video_id from watched_videos where user_id = $1 and status = 'watched' order by video_id",
        [id]
      )
      expect(kept.rows.map(row => row.video_id)).toEqual(
        Array.from({ length: 50 }, (_, n) => `race${String(n + 6).padStart(7, '0')}`)
      )
      const journal = await raw.query(
        "select operation, count(*)::int as n from sync_changes where user_id = $1 and entity_type = 'watchedVideo' group by operation order by operation",
        [id]
      )
      expect(journal.rows).toEqual([
        { operation: 'prune', n: 6 },
        { operation: 'watch', n: 8 }
      ])
      await done()
    }
  )

  test.skipIf(realPostgres === '')(
    'keeps one file when one photo is uploaded several times at once, and deletes the other copies',
    async () => {
      const { database, raw, id, done } = await anAccount('photo-race')
      const storage = new MemoryPhotoStorage()
      const files = photoFiles(accountStore(database.db), storage)
      const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.from(id)])
      const photoId = createHash('sha256').update(bytes).digest('hex')
      const uploads = await Promise.all(
        Array.from({ length: 6 }, () => files.upload(id, photoId, bytes, everyScope))
      )
      expect(uploads.map(upload => upload.status).sort()).toEqual([
        ...Array(5).fill('kept'),
        'stored'
      ])
      const kept = await raw.query('select storage_key from photo_files where user_id = $1', [id])
      expect(kept.rows).toHaveLength(1)
      await files.sweep()
      expect([...storage.objects.keys()]).toEqual([kept.rows[0]?.storage_key])
      await done()
    }
  )
})
