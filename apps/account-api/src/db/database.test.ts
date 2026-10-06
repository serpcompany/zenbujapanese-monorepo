import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { describe, expect, test } from 'vitest'
import { migrationsFolder as migrations } from '../config'
import { createAccounts } from '../domain/accounts'
import { cursorKey, cursors } from '../domain/cursor'
import { accountStore } from './accounts'
import { answers } from './database'
import { fenceIfRestored, restoreGap } from './restores'

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

  test('fence a restored copy once: profiles and the journal move past it, so writes made before it conflict and apps hear of it', async () => {
    const client = await migrated()
    const db = drizzle(client)
    const accounts = createAccounts(accountStore(db), cursors(cursorKey('test')))
    expect(await fenceIfRestored(db)).toBe('first start')
    expect(await fenceIfRestored(db)).toBe('same database')
    await client.query("insert into users (id, name, email) values ('u1', '', 'u1@example.com')")
    await accounts.updateProfile('u1', 1, { name: 'In the backup' })
    const synced = await accounts.sync('u1', {})
    const cursor = synced.status === 'synced' ? synced.cursor : ''

    await client.query('update sync_origin set database_oid = 1')
    expect(await fenceIfRestored(db)).toBe('restored')
    expect(await fenceIfRestored(db)).toBe('same database')

    const fenced = 2 + restoreGap.versions
    for (const seen of [2, 3]) {
      expect(await accounts.updateProfile('u1', seen, { name: 'Sent again' })).toMatchObject({
        status: 'conflict',
        profile: { name: 'In the backup', version: fenced }
      })
    }
    expect(await accounts.sync('u1', { cursor })).toMatchObject({
      status: 'synced',
      changes: [{ entity: 'profile', version: fenced }]
    })
    await client.query("insert into users (id, name, email) values ('u2', '', 'u2@example.com')")
    const journal = await client.query<{ sequence: number }>(
      "select sequence from sync_changes where user_id = 'u2'"
    )
    expect(Number(journal.rows[0]?.sequence)).toBeGreaterThan(restoreGap.journal)
    await client.close()
  })
})
