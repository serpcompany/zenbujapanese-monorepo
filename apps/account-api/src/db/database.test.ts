import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { describe, expect, test } from 'vitest'
import { migrationsFolder as migrations } from '../config'
import { type Accounts, createAccounts } from '../domain/accounts'
import { scopes } from '../domain/clients'
import { cursorKey, cursors } from '../domain/cursor'
import { accountStore } from './accounts'
import { answers } from './database'
import { purgeExpired } from './housekeeping'
import { fenceIfRestored } from './restores'

const everyScope = new Set(scopes)

const journalOf = (folder: string) =>
  JSON.parse(readFileSync(join(folder, 'meta/_journal.json'), 'utf8')) as {
    dialect: string
    entries: { tag: string; when: number }[]
  }

async function migrated() {
  const client = new PGlite()
  await migrate(drizzle(client), { migrationsFolder: migrations })
  return client
}

describe('the migrations', () => {
  test('list a SQL file for every entry in their journal', () => {
    const journal = journalOf(migrations)
    expect(journal.dialect).toBe('postgresql')
    for (const { tag } of journal.entries) {
      expect(existsSync(join(migrations, `${tag}.sql`)), tag).toBe(true)
    }
    const times = journal.entries.map(entry => entry.when)
    expect(times, 'Drizzle skips a migration older than the last one applied').toEqual(
      [...times].sort((a, b) => a - b)
    )
  })

  test('apply to an empty database, and again with nothing left to do', async () => {
    const client = new PGlite()
    const db = drizzle(client)
    await migrate(db, { migrationsFolder: migrations })
    await migrate(db, { migrationsFolder: migrations })
    const applied = await client.query("select to_regclass('drizzle.__drizzle_migrations') as name")
    expect(applied.rows).toEqual([{ name: 'drizzle.__drizzle_migrations' }])
    expect(await answers(db)).toBe(true)
    await client.close()
  })

  test("hold #374's rules: one account per email, whatever its case, and one per provider's subject", async () => {
    const client = await migrated()
    const insertUser = (id: string, email: string) =>
      client.query('insert into users (id, name, email) values ($1, $2, $3)', [id, '', email])
    await insertUser('u1', 'one@example.com')
    await expect(insertUser('u2', 'one@example.com')).rejects.toThrow(/users_email_unique/)
    await expect(insertUser('u3', 'One@Example.com')).rejects.toThrow(/users_email_ignoring_case/)
    const identity = (id: string) =>
      client.query(
        'insert into user_identities (id, user_id, provider, subject) values ($1, $2, $3, $4)',
        [id, 'u1', 'google', 'subject-1']
      )
    await identity('i1')
    await expect(identity('i2')).rejects.toThrow(/user_identities_provider_subject/)
    await client.close()
  })

  test('journal every account as it is made, and every account made before the journal', async () => {
    const earlier = mkdtempSync(join(tmpdir(), 'account-migrations-'))
    cpSync(migrations, earlier, { recursive: true })
    const journal = journalOf(earlier)
    const before = journal.entries.findIndex(entry => entry.tag.endsWith('_journal_accounts'))
    expect(before).toBeGreaterThan(0)
    writeFileSync(
      join(earlier, 'meta/_journal.json'),
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, before) })
    )
    const client = new PGlite()
    const db = drizzle(client)
    await migrate(db, { migrationsFolder: earlier })
    rmSync(earlier, { recursive: true })
    await client.query("insert into users (id, name, email) values ('old', '', 'old@example.com')")
    await migrate(db, { migrationsFolder: migrations })
    await client.query("insert into users (id, name, email) values ('new', '', 'new@example.com')")
    const entries = await client.query(
      'select user_id, entity_type, entity_id, entity_version, operation from sync_changes order by sequence'
    )
    expect(entries.rows).toEqual(
      ['old', 'new'].map(id => ({
        user_id: id,
        entity_type: 'profile',
        entity_id: id,
        entity_version: 1,
        operation: 'create'
      }))
    )
    await client.close()
  })

  test("hold the sync rules: one account per username, one result per account's mutation ID", async () => {
    const client = await migrated()
    const insertUser = (id: string, username: string) =>
      client.query('insert into users (id, name, email, username) values ($1, $2, $3, $4)', [
        id,
        '',
        `${id}@example.com`,
        username
      ])
    await insertUser('u1', 'kana')
    await expect(insertUser('u2', 'kana')).rejects.toThrow(/users_username_unique/)
    await insertUser('u3', 'kanji')
    const record = (userId: string) =>
      client.query(
        "insert into sync_mutations (user_id, client_mutation_id, entity_type, operation, request_sha256, outcome) values ($1, 'm-1', 'profile', 'update', 'x', 'applied')",
        [userId]
      )
    await record('u1')
    await expect(record('u1')).rejects.toThrow(/sync_mutations_user_id_client_mutation_id_pk/)
    await record('u3')
    const indexes = await client.query(
      "select indexdef from pg_indexes where tablename = 'sync_changes' and indexname = 'sync_changes_user_sequence'"
    )
    expect(indexes.rows).toEqual([{ indexdef: expect.stringMatching(/\(user_id, sequence\)/) }])
    await client.query("delete from users where id = 'u1'")
    const left = await client.query(
      "select (select count(*) from sync_changes where user_id = 'u1')::int as journal, (select count(*) from sync_mutations where user_id = 'u1')::int as mutations"
    )
    expect(left.rows).toEqual([{ journal: 0, mutations: 0 }])
    await client.close()
  })

  test('fence a restored copy past every version and cursor an app saw, even a second copy of one backup', async () => {
    const original = await migrated()
    expect(await fenceIfRestored(drizzle(original))).toBe('first start')
    expect(await fenceIfRestored(drizzle(original))).toBe('same database')
    await original.query("insert into users (id, name, email) values ('u1', '', 'u1@example.com')")
    await original.query(
      "insert into known_words (user_id, item_id, headword, reading, known, version) values ('u1', 'kanji:日', '日', 'にち', true, 1)"
    )
    await original.query(
      "insert into word_lists (user_id, id, name, position, version) values ('u1', '00000000-0000-4000-8000-000000000001', 'Kept', 0, 1)"
    )
    await original.query(
      "insert into list_words (user_id, list_id, item_id, headword, reading, present, version) values ('u1', '00000000-0000-4000-8000-000000000001', 'kanji:日', '日', 'にち', true, 1)"
    )
    const backup = await original.dumpDataDir()
    await original.close()

    const restore = async () => {
      const copy = new PGlite({ loadDataDir: backup })
      const db = drizzle(copy)
      await copy.query('update sync_origin set database_oid = 1')
      expect(await fenceIfRestored(db)).toBe('restored')
      expect(await fenceIfRestored(db)).toBe('same database')
      return { copy, accounts: createAccounts(accountStore(db), cursors(cursorKey('test'))) }
    }
    const answered = (answer: Awaited<ReturnType<Accounts['sync']>>) =>
      answer.status === 'synced' ? answer : expect.unreachable()

    const first = await restore()
    const seen = answered(await first.accounts.sync('u1', {}, everyScope))
    const firstVersion = seen.changes[0]?.version ?? 0
    expect(firstVersion).toBeGreaterThan(Date.now() - 60_000)
    const changed = await first.accounts.updateProfile('u1', firstVersion, {
      name: 'On the first copy'
    })
    expect(changed).toMatchObject({ status: 'updated' })
    const cursor = answered(
      await first.accounts.sync('u1', { cursor: seen.cursor }, everyScope)
    ).cursor
    await first.copy.close()
    await new Promise(resolve => setTimeout(resolve, 5))

    const second = await restore()
    const fenced = await second.copy.query<{ entity_type: string; entity_version: string }>(
      'select entity_type, entity_version from sync_changes order by entity_type'
    )
    expect(fenced.rows.map(row => row.entity_type)).toEqual([
      'knownWord',
      'list',
      'listWord',
      'profile'
    ])
    for (const row of fenced.rows) {
      expect(Number(row.entity_version)).toBeGreaterThan(Date.now() - 60_000)
    }
    for (const version of [firstVersion, firstVersion + 1]) {
      expect(
        await second.accounts.updateProfile('u1', version, { name: 'Sent again' })
      ).toMatchObject({
        status: 'conflict',
        profile: { name: '', version: expect.any(Number) }
      })
    }
    const caughtUp = answered(await second.accounts.sync('u1', { cursor }, everyScope))
    expect(caughtUp.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entity: 'profile', data: expect.objectContaining({ name: '' }) })
      ])
    )
    expect(caughtUp.changes.find(change => change.entity === 'profile')?.version).toBeGreaterThan(
      firstVersion + 1
    )
    await second.copy.close()
  }, 120_000)

  test('purge expired sessions, codes, and day-old rate limits, and keep the rest', async () => {
    const client = await migrated()
    await client.query("insert into users (id, name, email) values ('u1', '', 'u1@example.com')")
    await client.query(`insert into sessions (id, user_id, token, expires_at) values
      ('old', 'u1', 'old-token', now() - interval '1 minute'),
      ('live', 'u1', 'live-token', now() + interval '1 day')`)
    await client.query(`insert into verifications (id, identifier, value, expires_at) values
      ('old', 'sign-in-otp-a@example.com', 'x', now() - interval '1 minute'),
      ('live', 'sign-in-otp-b@example.com', 'x', now() + interval '5 minutes')`)
    await client.query(
      'insert into rate_limits (id, key, count, last_request) values ($1, $2, 1, $3), ($4, $5, 1, $6)',
      ['old', 'old-key', Date.now() - 2 * 24 * 60 * 60 * 1000, 'live', 'live-key', Date.now()]
    )
    await purgeExpired(drizzle(client))
    for (const table of ['sessions', 'verifications', 'rate_limits']) {
      const left = await client.query<{ id: string }>(`select id from ${table}`)
      expect(left.rows, table).toEqual([{ id: 'live' }])
    }
    await client.close()
  })
})
