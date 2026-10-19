import { expect } from 'vitest'
import { type Learner, useAccountService } from './accounts'
import type { BillingStandIns } from './service'

export interface SubscriptionAnswer {
  status: string
  active: boolean
  source: string | null
  productId: string | null
  expiresAt: string | null
  willRenew: boolean | null
  managedIn: string | null
  canSubscribe: boolean
  cloudAccess: string
  appAccountToken: string
  offers: { appStore: string[]; website: string[] }
}

export function useBillingService(billing: BillingStandIns) {
  const accounts = useAccountService({ billing })
  const call = (path: string, options: Parameters<typeof accounts.running.service.call>[1]) =>
    accounts.running.service.call(path, options)
  const rows = (sql: string) => accounts.running.service.rows(sql)

  async function subscription(learner: Learner): Promise<SubscriptionAnswer> {
    const answer = await call('/v1/me/subscription', { token: learner.token })
    expect(answer.status, JSON.stringify(answer.body)).toBe(200)
    return answer.body as unknown as SubscriptionAnswer
  }

  return {
    accounts,
    call,
    rows,
    subscription,
    stripeWebhook: ({ body, signature }: { body: string; signature: string }) =>
      call('/v1/webhooks/stripe', {
        method: 'POST',
        client: null,
        headers: { 'stripe-signature': signature },
        body
      }),
    appleWebhook: (body: string) =>
      call('/v1/webhooks/apple', { method: 'POST', client: null, body }),
    events: (where: string) =>
      rows(`select source, event_id, type, outcome, user_id from billing_events where ${where}`),
    ledger: (userId: string) =>
      rows(
        `select source, kind, outcome, reference, amount_minor::int as amount, currency, subscription_id from billing_ledger where user_id = '${userId}' order by id`
      )
  }
}
