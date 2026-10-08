import { PGlite } from '@electric-sql/pglite'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { describe, expect, test } from 'vitest'
import { failureFields } from './failure'

describe('failureFields', () => {
  test('logs a failed query by its SQL and its cause, never the values it was given', async () => {
    const client = new PGlite()
    const db = drizzle(client)
    const failure = await db
      .execute(sql`select * from accounts where email = ${'learner@example.com'}`)
      .then(
        () => undefined,
        (error: unknown) => error
      )
    await client.close()
    const fields = failureFields(failure)
    expect(fields.query).toBe('select * from accounts where email = $1')
    expect(fields.error).toMatch(/relation "accounts" does not exist/)
    expect(JSON.stringify(fields)).not.toContain('learner@example.com')
  })

  test('describes any other error as the shared log does', () => {
    expect(failureFields(new Error('closed'))).toMatchObject({ error: 'closed' })
  })
})
