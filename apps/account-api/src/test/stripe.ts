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
  firstPayment?: 'paid' | 'open'
  email?: string
}

type StripeObject = Record<string, unknown>

interface Request {
  method: string
  path: string
  form: URLSearchParams
  idempotencyKey: string | null
  duringATransaction: boolean
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
      billing_reason: 'subscription_create',
      status: fields.firstPayment ?? 'paid',
      amount_due: 500,
      customer_email: fields.email ?? null,
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

const prices: Record<string, StripeObject> = {
  price_monthly: { unit_amount: 499, recurring: { interval: 'month', interval_count: 1 } },
  price_yearly: { unit_amount: 4999, recurring: { interval: 'year', interval_count: 1 } },
  price_metered: { unit_amount: null, recurring: { interval: 'month', interval_count: 1 } }
}

export function standInStripe() {
  const subscriptions = new Map<string, StripeObject>()
  const requests: Request[] = []
  const refunded = new Set<string>()
  const charges = new Map<string, string>()
  const payments = new Map<string, StripeObject>()
  const konbini = new Set<string>()
  const state: {
    down: boolean
    refusingRefunds: { status: number; code: string } | null
    reads: Promise<void> | null
    inATransaction: () => boolean
  } = {
    down: false,
    refusingRefunds: null,
    reads: null,
    inATransaction: () => false
  }
  let sessions = 1
  const checkouts = new Map<string, StripeObject>()

  const route = (method: string, path: string, form: URLSearchParams): Response => {
    const [, , kind, id] = path.split('/')
    if (method === 'POST' && path === '/v1/checkout/sessions') {
      const session = `cs_test_${sessions++}`
      const created = {
        id: session,
        object: 'checkout.session',
        status: 'open',
        subscription: null,
        created: nowS(),
        url: `https://checkout.stripe.com/c/pay/${session}`
      }
      checkouts.set(session, created)
      return answer(created)
    }
    const [, , , , sessionId, step] = path.split('/')
    const checkout = kind === 'checkout' && sessionId ? checkouts.get(sessionId) : undefined
    if (kind === 'checkout' && !checkout) return missing()
    if (checkout && method === 'POST' && step === 'expire') {
      if (checkout.status !== 'open') {
        return answer(
          { error: { type: 'invalid_request_error', message: 'Only an open session expires.' } },
          400
        )
      }
      checkout.status = 'expired'
      return answer(checkout)
    }
    if (checkout) return answer(checkout)
    if (method === 'POST' && path === '/v1/billing_portal/sessions') {
      return answer({
        id: `bps_${sessions}`,
        url: `https://billing.stripe.com/p/session/${sessions++}`
      })
    }
    if (method === 'POST' && path === '/v1/refunds') {
      const intent = form.get('payment_intent') ?? ''
      if (konbini.has(intent) && !form.get('instructions_email')) {
        return answer(
          {
            error: {
              type: 'invalid_request_error',
              code: 'parameter_missing',
              param: 'instructions_email',
              message: 'A konbini refund needs an email for its instructions.'
            }
          },
          400
        )
      }
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
    if (method === 'GET' && kind === 'prices' && id && prices[id]) {
      const product = { id: 'prod_sync', object: 'product', name: 'Zenbu Sync' }
      const expanded = [...form.entries()].some(
        ([key, value]) => key.startsWith('expand') && value === 'product'
      )
      return answer({
        id,
        object: 'price',
        currency: 'usd',
        nickname: null,
        product: expanded ? product : product.id,
        ...prices[id]
      })
    }
    if (method === 'GET' && kind === 'charges' && id) {
      return answer({ id, object: 'charge', customer: charges.get(id) ?? null })
    }
    if (method === 'GET' && path === '/v1/invoice_payments') {
      const paid = payments.get(form.get('payment[payment_intent]') ?? '')
      return answer({
        object: 'list',
        data: paid ? [{ object: 'invoice_payment', invoice: paid }] : []
      })
    }
    const subscription = kind === 'subscriptions' && id ? subscriptions.get(id) : undefined
    if (!subscription) return missing()
    if (method === 'DELETE') {
      Object.assign(subscription, { status: 'canceled', ended_at: nowS() })
    }
    const expanded = [...form.entries()].some(
      ([key, value]) => key.startsWith('expand') && value.startsWith('latest_invoice')
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
      idempotencyKey: headers.get('idempotency-key'),
      duringATransaction: state.inATransaction()
    })
    if (state.down) return answer({ error: { type: 'api_error', message: 'Stripe is down' } }, 500)
    const answered = route(method, url.pathname, form)
    const held = method === 'GET' && url.pathname.startsWith('/v1/subscriptions/') && state.reads
    if (held) {
      state.reads = null
      await held
    }
    return answered
  }

  const thin = (type: string) =>
    signed({ id: `evt_${randomUUID()}`, object: 'v2.core.event', type, related_object: {} })

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
    konbini,
    thin,
    holdTheNextRead() {
      let release = () => {}
      state.reads = new Promise<void>(resolve => {
        release = resolve
      })
      return () => release()
    },
    charges,
    payments,
    state,
    subscriptions,
    checkouts,
    completeCheckout(sessionId: string, subscriptionId: string) {
      Object.assign(checkouts.get(sessionId) ?? {}, {
        status: 'complete',
        subscription: subscriptionId
      })
    },
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
    event(type: string, object: StripeObject, id = `evt_${randomUUID()}`, created = nowS()) {
      return signed({
        id,
        object: 'event',
        type,
        api_version: Stripe.API_VERSION,
        created,
        livemode: false,
        pending_webhooks: 1,
        request: { id: null, idempotency_key: null },
        data: { object }
      })
    }
  }
}

export type StandInStripe = ReturnType<typeof standInStripe>
