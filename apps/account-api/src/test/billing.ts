import { expect } from 'vitest'
import { type Learner, useAccountService } from './accounts'
import type { BillingStandIns } from './service'
import type { StandInStripe } from './stripe'

export interface SubscriptionAnswer {
  status: string
  active: boolean
  source: string | null
  productId: string | null
  expiresAt: string | null
  willRenew: boolean | null
  managedIn: string | null
  canSubscribe: boolean
  running: { source: string; status: string; managedIn: string }[]
  cloudAccess: string
  appAccountToken: string
  offers: { appStore: string[]; website: string[] }
}

type SubscriptionFields = Parameters<StandInStripe['subscription']>[0]

export function useBillingService(billing: BillingStandIns) {
  const accounts = useAccountService({ billing })
  const call = (path: string, options: Parameters<typeof accounts.running.service.call>[1]) =>
    accounts.running.service.call(path, options)
  const rows = (sql: string) => accounts.running.service.rows(sql)

  const settled =
    <Args extends unknown[], Answer>(send: (...args: Args) => Promise<Answer>) =>
    async (...args: Args) => {
      const answer = await send(...args)
      await accounts.running.service.billing.settleOwed()
      return answer
    }

  async function subscription(learner: Learner): Promise<SubscriptionAnswer> {
    const answer = await call('/v1/me/subscription', { token: learner.token })
    expect(answer.status, JSON.stringify(answer.body)).toBe(200)
    return answer.body as unknown as SubscriptionAnswer
  }

  const stripeWebhook = settled(({ body, signature }: { body: string; signature: string }) =>
    call('/v1/webhooks/stripe', {
      method: 'POST',
      client: null,
      headers: { 'stripe-signature': signature },
      body
    })
  )

  return {
    accounts,
    call,
    rows,
    subscription,
    stripeWebhook,

    appleWebhook: settled((body: string) =>
      call('/v1/webhooks/apple', { method: 'POST', client: null, body })
    ),
    deleted: async (userId: string) => {
      await rows(`delete from users where id = '${userId}'`)
      await rows(`insert into deleted_accounts (user_id) values ('${userId}')`)
    },
    holds: (
      learner: Learner,
      held: { source: string; expiresAt: Date; willRenew?: boolean; environment?: string }
    ) =>
      rows(
        `insert into subscriptions (source, provider_id, user_id, product_id, status, expires_at, will_renew, environment, period_started_at, state_at, origin)
          values ('${held.source}', '${held.source}_${learner.userId}', '${learner.userId}', 'product', 'active', '${held.expiresAt.toISOString()}', ${held.willRenew ?? true}, '${held.environment ?? 'test'}', now() - interval '30 days', now(), 'provider')`
      ),
    deleteAccount: (learner: Learner) =>
      call('/v1/me', { token: learner.token, body: { confirm: true }, method: 'DELETE' }),
    expectNothingDeleted: async (learner: Learner, answer: { status: number; body: unknown }) => {
      expect(answer).toMatchObject({
        status: 503,
        body: { error: { code: 'billing_unavailable' } }
      })
      expect((await accounts.me(learner.token)).status).toBe(200)
    },
    async subscribeOnTheWebsite(
      stripe: StandInStripe,
      email: string,
      fields: SubscriptionFields = {}
    ) {
      const learner = await accounts.learner(email)
      const customer = `cus_${learner.userId.slice(0, 10)}`
      const id = String(stripe.subscription({ userId: learner.userId, customer, ...fields }).id)
      await stripeWebhook(
        stripe.event('checkout.session.completed', {
          id: `cs_${id}`,
          object: 'checkout.session',
          mode: 'subscription',
          client_reference_id: learner.userId,
          customer,
          subscription: id
        })
      )
      return { learner, customer, id }
    },
    owedActions: () =>
      rows('select subscription_id, attempts, done_at is not null as done from billing_actions'),
    retryOwedNow: async () => {
      await rows('update billing_actions set claimed_until = null where done_at is null')
      await accounts.running.service.billing.settleOwed()
    },
    events: (where: string) =>
      rows(`select source, event_id, type, outcome, user_id from billing_events where ${where}`),
    ledger: (userId: string) =>
      rows(
        `select source, kind, outcome, reference, amount_minor::int as amount, currency, subscription_id from billing_ledger where user_id = '${userId}' order by id`
      )
  }
}
