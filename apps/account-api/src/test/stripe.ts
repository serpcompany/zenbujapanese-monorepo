import { randomUUID } from 'node:crypto'
import Stripe from 'stripe'
import { accountMetadataKey } from '../billing/stripe-events'
import type { StripeSettings } from '../billing-config'

export const stripeSettings: StripeSettings = {
  secretKey: 'sk_test_stand-in',
  webhookSecret: 'whsec_stand-in',
  prices: ['price_monthly', 'price_yearly'],
  trialDays: null,
  gracePeriodDays: 0
}

const dayS = 24 * 60 * 60
const nowS = () => Math.floor(Date.now() / 1000)

export interface SubscriptionFields {
  id?: string
  userId?: string
  customer?: string
  price?: string
  status?: string
  periodStart?: number
  periodEnd?: number
  cancelAtPeriodEnd?: boolean
  paymentIntent?: string
}

type StripeObject = Record<string, unknown>

interface Request {
  method: string
  path: string
  form: URLSearchParams
  idempotencyKey: string | null
}

const answer = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const missing = () =>
  answer(
    {
      error: { type: 'invalid_request_error', code: 'resource_missing', message: 'No such object' }
    },
    404
  )

function subscriptionObject(fields: SubscriptionFields): StripeObject {
  const start = fields.periodStart ?? nowS()
  const status = fields.status ?? 'active'
  const id = fields.id ?? `sub_${randomUUID().slice(0, 8)}`
  return {
    id,
    object: 'subscription',
    customer: fields.customer ?? 'cus_stand-in',
    status,
    livemode: false,
    metadata: fields.userId ? { [accountMetadataKey]: fields.userId } : {},
    cancel_at_period_end: fields.cancelAtPeriodEnd ?? false,
    cancel_at: null,
    ended_at: status === 'canceled' ? nowS() : null,
    items: {
      object: 'list',
      data: [
        {
          id: `si_${id}`,
          object: 'subscription_item',
          price: { id: fields.price ?? 'price_monthly', object: 'price' },
          current_period_start: start,
          current_period_end: fields.periodEnd ?? start + 30 * dayS
        }
      ]
    },
    latest_invoice: {
      id: `in_${id}`,
      object: 'invoice',
      payments: {
        object: 'list',
        data: fields.paymentIntent
          ? [
              {
                status: 'paid',
                payment: { type: 'payment_intent', payment_intent: fields.paymentIntent }
              }
            ]
          : []
      }
    }
  }
}

export function standInStripe() {
  const subscriptions = new Map<string, StripeObject>()
  const requests: Request[] = []
  const refunded = new Set<string>()
  const state: { down: boolean; refusingRefunds: { status: number; code: string } | null } = {
    down: false,
    refusingRefunds: null
  }
  let sessions = 1

  const route = (method: string, path: string, form: URLSearchParams): Response => {
    const [, , kind, id] = path.split('/')
    if (method === 'POST' && path === '/v1/checkout/sessions') {
      const session = `cs_test_${sessions++}`
      return answer({
        id: session,
        object: 'checkout.session',
        url: `https://checkout.stripe.com/c/pay/${session}`
      })
    }
    if (method === 'POST' && path === '/v1/billing_portal/sessions') {
      return answer({
        id: `bps_${sessions}`,
        url: `https://billing.stripe.com/p/session/${sessions++}`
      })
    }
    if (method === 'POST' && path === '/v1/refunds') {
      const intent = form.get('payment_intent') ?? ''
      const refusal = refunded.has(intent)
        ? { status: 400, code: 'charge_already_refunded' }
        : state.refusingRefunds
      if (refusal) {
        const type = refusal.status >= 500 ? 'api_error' : 'invalid_request_error'
        return answer(
          { error: { type, code: refusal.code, message: 'The refund was refused.' } },
          refusal.status
        )
      }
      refunded.add(intent)
      return answer({ id: `re_${sessions++}`, object: 'refund', status: 'succeeded' })
    }
    const subscription = kind === 'subscriptions' && id ? subscriptions.get(id) : undefined
    if (!subscription) return missing()
    if (method === 'DELETE') {
      Object.assign(subscription, { status: 'canceled', ended_at: nowS() })
    }
    const expanded = [...form.entries()].some(
      ([key, value]) => key.startsWith('expand') && value === 'latest_invoice.payments'
    )
    const invoice = subscription.latest_invoice as { id: string }
    return answer(expanded ? subscription : { ...subscription, latest_invoice: invoice.id })
  }

  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.hostname !== 'api.stripe.com')
      throw new Error(`the stand-in got a request for ${url.host}`)
    const method = init?.method ?? 'GET'
    const headers = new Headers(init?.headers)
    const form = new URLSearchParams(method === 'GET' ? url.search : String(init?.body ?? ''))
    requests.push({
      method,
      path: url.pathname,
      form,
      idempotencyKey: headers.get('idempotency-key')
    })
    if (state.down) return answer({ error: { type: 'api_error', message: 'Stripe is down' } }, 500)
    return route(method, url.pathname, form)
  }

  const signed = (event: StripeObject) => {
    const body = JSON.stringify(event)
    return {
      body,
      signature: Stripe.webhooks.generateTestHeaderString({
        payload: body,
        secret: stripeSettings.webhookSecret
      })
    }
  }

  return {
    fetch,
    requests,
    refunded,
    state,
    subscriptions,
    subscription(fields: SubscriptionFields) {
      const subscription = subscriptionObject(fields)
      subscriptions.set(String(subscription.id), subscription)
      return subscription
    },
    change(id: string, fields: SubscriptionFields) {
      const current = subscriptions.get(id)
      const changed = subscriptionObject({
        id,
        customer: String(current?.customer),
        userId: (current?.metadata as Record<string, string> | undefined)?.[accountMetadataKey],
        ...fields
      })
      subscriptions.set(id, changed)
      return changed
    },
    event(type: string, object: StripeObject, id = `evt_${randomUUID()}`) {
      return signed({
        id,
        object: 'event',
        type,
        api_version: Stripe.API_VERSION,
        created: nowS(),
        livemode: false,
        pending_webhooks: 1,
        request: { id: null, idempotency_key: null },
        data: { object }
      })
    }
  }
}

export type StandInStripe = ReturnType<typeof standInStripe>
