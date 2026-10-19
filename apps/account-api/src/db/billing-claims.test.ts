import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { expect, test } from 'vitest'
import { migrationsFolder as migrations } from '../config'
import { billingStore } from './billing'

async function owing(source = 'stripe') {
  const client = new PGlite()
  await migrate(drizzle(client), { migrationsFolder: migrations })
  await client.query(
    "insert into billing_actions (source, subscription_id, action) values ($1, 'sub_owed', 'refund_and_cancel')",
    [source]
  )
  const row = async () =>
    (
      await client.query<{ attempts: number; done: boolean; last_failure: string | null }>(
        'select attempts, done_at is not null as done, last_failure from billing_actions'
      )
    ).rows[0]
  return { client, store: billingStore(drizzle(client)), row }
}

test("a run that lost its claim changes nothing, while another run holds it or after it's done", async () => {
  const { client, store, row } = await owing()
  const slow = await store.claimOwedAction(['stripe'])
  await client.query("update billing_actions set claimed_until = now() - interval '1 second'")
  const next = await store.claimOwedAction(['stripe'])
  expect(next).toMatchObject({ attempts: 2 })
  expect(slow && (await store.settleOwedAction(slow, 'a late timeout'))).toBe('lost')
  expect(await row()).toEqual({ attempts: 2, done: false, last_failure: null })
  expect(next && (await store.settleOwedAction(next, null))).toBe('settled')
  expect(slow && (await store.settleOwedAction(slow, 'later still'))).toBe('lost')
  expect(await row()).toEqual({ attempts: 2, done: true, last_failure: null })
  await client.close()
})

test("claims only the stores it can settle, so a store that's off spends no attempts", async () => {
  const { client, store, row } = await owing('stripe')
  expect(await store.claimOwedAction([])).toBeNull()
  expect(await store.claimOwedAction(['apple'])).toBeNull()
  expect(await row()).toEqual({ attempts: 0, done: false, last_failure: null })
  await client.close()
})
