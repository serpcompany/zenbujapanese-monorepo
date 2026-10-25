import { createHash } from 'node:crypto'
import { cases } from '@zenbu/account-rules/test/cases'
import pg from 'pg'
import { describe, expect, test, vi } from 'vitest'
import { migrationsFolder as migrations } from '../config'
import { createAccounts } from '../domain/accounts'
import { scopes } from '../domain/clients'
import { cursorKey, cursors, searchKeys } from '../domain/cursor'
import { photoFiles } from '../domain/photo-files'
import type { AccountStore } from '../domain/store'
import { MemoryPhotoStorage } from '../storage/memory'
import { gate } from '../test/gate'
import { realPostgres, usePostgres } from '../test/postgres'
import { accountStore } from './accounts'
import { migratePostgres, migrationLock, openPostgres } from './postgres'

const everyScope = new Set(scopes)

const postgres = usePostgres()
const anAccount = postgres.anAccount

describe('Postgres, through the driver the service runs', () => {
  test('applies the migrations, and again with nothing left to do', async () => {
    await migratePostgres(postgres.url(), migrations)
    await migratePostgres(postgres.url(), migrations)
  })

  test.skipIf(realPostgres === '')(
    'waits while another start holds the migration lock, then migrates',
    async () => {
      const other = new pg.Client({ connectionString: postgres.url() })
      await other.connect()
      await other.query('select pg_advisory_lock($1)', [migrationLock])
      let finished = false
      const migrating = migratePostgres(postgres.url(), migrations).then(() => {
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
    const database = openPostgres(postgres.url())
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

  test('prunes videos watched at the same time in the shared order, whatever the collation', async () => {
    const { database, raw, id, done } = await anAccount('watch-ties')
    const { videos } = cases<{ videos: { ids: string[]; newestFirst: string[] } }>('recent-order')
    await raw.query(
      "insert into watched_videos (user_id, video_id, watched_at, status, version) select $1, 'later' || lpad(n::text, 6, '0'), timestamptz '2026-10-01T00:00:00Z' + n * interval '1 second', 'watched', 1 from generate_series(1, 50 - $3::int) as n union all select $1, tied, timestamptz '2000-01-01T00:00:01Z', 'watched', 1 from unnest($2::text[]) as tied",
      [id, videos.ids, videos.ids.length]
    )
    const accounts = createAccounts(
      accountStore(database.db),
      cursors(cursorKey('test')),
      searchKeys('test')
    )
    const pruned: string[] = []
    for (const n of videos.ids.keys()) {
      await accounts.sync(
        id,
        {
          mutations: [
            {
              id: `tie-${n}`,
              entity: 'watchedVideo',
              operation: 'watch',
              entityId: `newer${String(n).padStart(6, '0')}`,
              baseVersion: 0,
              fields: { watchedAt: new Date(Date.UTC(2026, 9, 2) + n * 1000).toISOString() }
            }
          ]
        },
        everyScope
      )
      const gone = await raw.query(
        "select video_id from watched_videos where user_id = $1 and status = 'pruned' and not video_id = any($2)",
        [id, pruned]
      )
      pruned.push(...gone.rows.map(row => row.video_id))
    }
    expect(pruned).toEqual([...videos.newestFirst].reverse())
    await done()
  })

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

  test.skipIf(realPostgres === '')(
    'deletes the file of an upload saving its row while its account is being deleted',
    async () => {
      const { database, raw, id, done } = await anAccount('photo-deleted-mid-save')
      const storage = new MemoryPhotoStorage()
      const store = accountStore(database.db)
      const saving = gate()
      const finish = gate()
      const holding: AccountStore = {
        ...store,
        withLockedAccount: (userId, work) =>
          store.withLockedAccount(userId, account =>
            work({
              ...account,
              async cancelPhotoDeletion(storageKey) {
                await account.cancelPhotoDeletion(storageKey)
                saving.open()
                await finish.opened
              }
            })
          )
      }
      const files = photoFiles(holding, storage)
      const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.from(id)])
      const photoId = createHash('sha256').update(bytes).digest('hex')
      const upload = files.upload(id, photoId, bytes, everyScope)
      await saving.opened
      const deletion = store.deleteAccount(id, `${id}@example.com`)
      await vi.waitFor(async () => {
        const waiting = await raw.query(
          "select count(*)::int as n from pg_stat_activity where wait_event_type = 'Lock' and datname = current_database()"
        )
        expect(waiting.rows).toEqual([{ n: 1 }])
      })
      finish.open()
      expect((await upload).status).toBe('stored')
      await deletion
      await files.sweep()
      expect([...storage.objects.keys()]).toEqual([])
      await done()
    }
  )
})
