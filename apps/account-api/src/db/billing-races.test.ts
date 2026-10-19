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
    { stripe: stripeBilling(stripeSettings, { fetch: stripe.fetch, retries: 0 }), apple: null },
    cloudIsFree
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
  const kept = await raw.query<{ status: string }>(
    'select status from subscriptions where user_id = $1 order by status',
    [userId]
  )
  await raw.end()
  await database.close()
  return {
    answers,
    atStripe: tabs.map(id => stripe.subscriptions.get(id)?.status).sort(),
    kept: kept.rows.map(row => row.status),
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
          kept: ['active', 'expired'],
          refunds: 1
        })
      }
    }
  )
})
