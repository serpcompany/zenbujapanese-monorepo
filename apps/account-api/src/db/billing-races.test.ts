import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { describe, expect, test } from 'vitest'
import { stripeBilling } from '../billing/stripe'
import { migrationsFolder as migrations } from '../config'
import { cloudIsFree } from '../domain/cloud-access'
import { createBilling } from '../domain/subscription-billing'
import { standInStripe, stripeSettings } from '../test/stripe'
import { billingStore } from './billing'
import { migratePostgres, openPostgres } from './postgres'

const realPostgres = process.env.ACCOUNT_API_TEST_DATABASE_URL ?? ''

async function race(created: boolean) {
  await migratePostgres(realPostgres, migrations)
  const database = openPostgres(realPostgres)
  const raw = new pg.Client({ connectionString: realPostgres })
  await raw.connect()
  const userId = `checkout-race-${randomUUID()}`
  await raw.query('insert into users (id, name, email) values ($1, $2, $3)', [
    userId,
    '',
    `${userId}@example.com`
  ])
  const stripe = standInStripe()
  const billing = createBilling(
    billingStore(database.db),
    { web: stripeBilling(stripeSettings, { fetch: stripe.fetch, retries: 0 }), store: null },
    { cloud: cloudIsFree, storeTesting: null }
  )
  const customer = `cus_${userId}`
  const tabs = ['pi_tab_one', 'pi_tab_two'].map(paymentIntent =>
    String(stripe.subscription({ userId, customer, paymentIntent }).id)
  )
  const deliver = (event: { body: string; signature: string }) =>
    billing.stripeEvent(event.body, event.signature)
  if (created) {
    for (const id of tabs) {
      await deliver(stripe.event('customer.subscription.created', { id, object: 'subscription' }))
    }
  }
  const completed = tabs.map(id =>
    stripe.event('checkout.session.completed', {
      id: `cs_${id}`,
      object: 'checkout.session',
      mode: 'subscription',
      client_reference_id: userId,
      customer,
      subscription: id
    })
  )
  const answers = await Promise.all(completed.map(deliver))
  await billing.settleOwed()
  await raw.end()
  await database.close()
  return {
    answers,
    atStripe: tabs.map(id => stripe.subscriptions.get(id)?.status).sort(),
    refunds: stripe.requests.filter(each => each.path === '/v1/refunds').length
  }
}

describe('two checkouts that complete at once for one account, on Postgres', () => {
  test.skipIf(realPostgres === '')(
    'keep exactly one, before either subscription is saved and after both are',
    async () => {
      for (const created of [false, true]) {
        expect(await race(created), `saved first: ${created}`).toEqual({
          answers: ['applied', 'applied'],
          atStripe: ['active', 'canceled'],
          refunds: 1
        })
      }
    }
  )
})

async function waiterOn(raw: pg.Client, name: string) {
  for (let tries = 0; tries < 200; tries++) {
    const { rows } = await raw.query<{ waiting: number }>(
      `select count(*)::int as waiting from pg_locks
        where locktype = 'advisory' and not granted
          and classid = ((hashtextextended($1, 0) >> 32) & 4294967295)::bigint::oid
          and objid = (hashtextextended($1, 0) & 4294967295)::bigint::oid`,
      [name]
    )
    if ((rows[0]?.waiting ?? 0) > 0) return true
    await new Promise(resolve => setImmediate(resolve))
  }
  return false
}

describe("a subscription's lock, on Postgres", () => {
  test.skipIf(realPostgres === '')(
    'holds a subscription while one transaction changes it, so a second waits for it',
    async () => {
      await migratePostgres(realPostgres, migrations)
      const database = openPostgres(realPostgres)
      const raw = new pg.Client({ connectionString: realPostgres })
      await raw.connect()
      const store = billingStore(database.db)
      const key = { source: 'stripe', providerId: `sub_lock_${randomUUID()}` }
      let holding = () => {}
      let release = () => {}
      const firstHolds = new Promise<void>(resolve => {
        holding = resolve
      })
      const released = new Promise<void>(resolve => {
        release = resolve
      })
      const first = store.transaction(async tx => {
        await tx.lockSubscription(key)
        holding()
        await released
      })
      await firstHolds
      let secondGotIt = false
      const second = store.transaction(async tx => {
        await tx.lockSubscription(key)
        secondGotIt = true
      })
      expect(await waiterOn(raw, `${key.source}:${key.providerId}`)).toBe(true)
      expect(secondGotIt).toBe(false)
      release()
      await Promise.all([first, second])
      expect(secondGotIt).toBe(true)
      await raw.end()
      await database.close()
    }
  )
})
