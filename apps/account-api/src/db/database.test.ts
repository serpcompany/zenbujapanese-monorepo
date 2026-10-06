import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { describe, expect, test } from 'vitest'
import { readConfig } from '../config'
import { answers } from './database'

const { migrations } = readConfig({ DATABASE_URL: 'postgres://localhost/account' })

describe('the migrations', () => {
  test('list a SQL file for every entry in their journal', () => {
    const journal = JSON.parse(readFileSync(join(migrations, 'meta/_journal.json'), 'utf8')) as {
      dialect: string
      entries: { tag: string }[]
    }
    expect(journal.dialect).toBe('postgresql')
    for (const { tag } of journal.entries) {
      expect(existsSync(join(migrations, `${tag}.sql`)), tag).toBe(true)
    }
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
})
