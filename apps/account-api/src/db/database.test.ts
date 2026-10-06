import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { describe, expect, test } from 'vitest'
import { migrationsFolder as migrations } from '../config'
import { answers } from './database'

describe('the migrations', () => {
  test('list a SQL file for every entry in their journal', () => {
    const journal = JSON.parse(readFileSync(join(migrations, 'meta/_journal.json'), 'utf8')) as {
      dialect: string
      entries: { tag: string; when: number }[]
    }
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
    const client = new PGlite()
    await migrate(drizzle(client), { migrationsFolder: migrations })
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
})
