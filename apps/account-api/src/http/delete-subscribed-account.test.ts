import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, test } from 'vitest'
import type { Learner } from '../test/accounts'
import { standInAppStore } from '../test/app-store'
import { useBillingService } from '../test/billing'
import { standInStripe } from '../test/stripe'

const stripe = standInStripe()
const appStore = standInAppStore()
const billing = useBillingService({ stripe, appStore })

afterEach(() => {
  stripe.state.down = false
})

const remove = (learner: Learner) =>
  billing.call('/v1/me', { token: learner.token, body: { confirm: true }, method: 'DELETE' })

const countIn = async (table: string, userId: string) =>
  (await billing.rows(`select count(*)::int as n from ${table} where user_id = '${userId}'`))[0]?.n

async function websiteSubscriber(email: string) {
  const learner = await billing.accounts.learner(email)
  const customer = `cus_${learner.userId.slice(0, 10)}`
  const subscription = stripe.subscription({ userId: learner.userId, customer })
  const id = String(subscription.id)
  await billing.stripeWebhook(
    stripe.event('checkout.session.completed', {
      id: `cs_${id}`,
      object: 'checkout.session',
      mode: 'subscription',
      client_reference_id: learner.userId,
      customer,
      subscription: id
    })
  )
  await billing.stripeWebhook(
    stripe.event('invoice.paid', {
      id: `in_${id}`,
      object: 'invoice',
      customer,
      attempt_count: 1,
      amount_paid: 500,
      amount_due: 500,
      currency: 'usd',
      parent: { type: 'subscription_details', subscription_details: { subscription: id } }
    })
  )
  return { learner, id }
}

describe('DELETE /v1/me, with a subscription', () => {
  test('cancels a website subscription at Stripe first, so a deleted account is never charged, and keeps the ledger without the account', async () => {
    const { learner, id } = await websiteSubscriber('delete-stripe@example.com')
    expect(await remove(learner)).toMatchObject({ status: 200, body: { status: 'deleted' } })
    expect(stripe.requests).toContainEqual(
      expect.objectContaining({ method: 'DELETE', path: `/v1/subscriptions/${id}` })
    )
    expect(stripe.subscriptions.get(id)?.status).toBe('canceled')
    for (const table of [
      'subscriptions',
      'billing_customers',
      'billing_ledger',
      'billing_events'
    ]) {
      expect(await countIn(table, learner.userId), table).toBe(0)
    }
    expect(
      await billing.rows(
        `select user_id, outcome from billing_ledger where reference = 'in_${id}:1'`
      )
    ).toEqual([{ user_id: null, outcome: 'succeeded' }])
  })

  test("deletes nothing while Stripe doesn't answer, and says to try again", async () => {
    const { learner } = await websiteSubscriber('delete-stripe-down@example.com')
    stripe.state.down = true
    expect(await remove(learner)).toMatchObject({
      status: 503,
      body: { error: { code: 'billing_unavailable' } }
    })
    expect((await billing.accounts.me(learner.token)).status).toBe(200)
    stripe.state.down = false
    expect((await remove(learner)).status).toBe(200)
  })

  test('deletes an account with an App Store subscription, which Apple bills until the learner cancels it, and a new account may claim it', async () => {
    const learner = await billing.accounts.learner('delete-apple@example.com')
    const appAccountToken = (await billing.subscription(learner)).appAccountToken
    const originalTransactionId = randomUUID()
    const signedTransaction = await appStore.transaction({ originalTransactionId, appAccountToken })
    await billing.call('/v1/me/subscription/apple', {
      token: learner.token,
      body: { signedTransaction }
    })
    const stripeCalls = stripe.requests.length
    expect((await remove(learner)).status).toBe(200)
    expect(stripe.requests).toHaveLength(stripeCalls)
    expect(await countIn('subscriptions', learner.userId)).toBe(0)

    const renewal = await appStore.notification({
      type: 'DID_RENEW',
      transaction: { originalTransactionId, appAccountToken, purchaseDate: Date.now() + 1000 },
      status: 1
    })
    expect((await billing.appleWebhook(renewal)).status).toBe(200)
    expect(
      await billing.rows(
        `select user_id from subscriptions where provider_id = '${originalTransactionId}'`
      )
    ).toEqual([])

    const again = await billing.accounts.learner('delete-apple@example.com')
    expect(
      (
        await billing.call('/v1/me/subscription/apple', {
          token: again.token,
          body: { signedTransaction }
        })
      ).status
    ).toBe(200)
    expect((await billing.subscription(again)).active).toBe(true)
  })
})
