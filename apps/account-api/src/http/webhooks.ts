import { createRoute, type OpenAPIHono } from '@hono/zod-openapi'
import { log } from '@zenbu/node-service/log'
import type { Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { Billing, WebhookAnswer } from '../domain/subscription-billing'
import type { AccountEnv } from './env'
import { errorBody } from './errors'
import { json, refusal } from './refusals'
import {
  AppleNotificationSchema,
  ReceivedSchema,
  StripeEventSchema,
  StripeWebhookHeaders
} from './subscription-schemas'

const webhookBodyLimitKb = 256

const answers = (signedBy: string) => ({
  200: json(ReceivedSchema, 'Taken, or a repeat of an event already taken, which changed nothing.'),
  400: refusal({
    invalid_signature: `${signedBy} didn't sign the body, or it is for another app or environment. Nothing was recorded.`,
    unreadable_event: `${signedBy} signed it, but it isn't in a format the service reads, such as a thin Stripe event. Nothing was recorded; the endpoint's settings need changing.`
  }),
  404: refusal({ not_found: "This environment doesn't take this store's events." }),
  413: refusal({ too_large: `The body is over ${webhookBodyLimitKb} KB.` }),
  500: refusal({ internal: 'The event failed and was not recorded, so the store sends it again.' }),
  503: refusal({
    try_again:
      "The service couldn't check or apply the event now, and recorded nothing. The store sends it again."
  })
})

const stripeWebhook = createRoute({
  method: 'post',
  path: '/v1/webhooks/stripe',
  summary: "Stripe's events, for subscriptions bought on the website",
  description:
    "Stripe's webhook endpoint. The signature in `Stripe-Signature` is checked before anything in the body is read, and each event is recorded once by its ID: a repeat answers 200 and changes nothing. The service takes `checkout.session.completed`, `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`, and `refund.*`, reads each subscription's state from Stripe as it is then, and records every charge and refund in its ledger.",
  request: {
    headers: StripeWebhookHeaders,
    body: { content: { 'application/json': { schema: StripeEventSchema } }, required: true }
  },
  responses: answers('Stripe')
})

const appleWebhook = createRoute({
  method: 'post',
  path: '/v1/webhooks/apple',
  summary: 'App Store Server Notifications V2, for subscriptions bought in the app',
  description:
    "The App Store's notification URL. The signed payload is checked with Apple's App Store Server Library against Apple's root certificate, for the app's bundle ID and the environments the service takes, before anything in it is read, and each notification is recorded once by its `notificationUUID`: a repeat answers 200 and changes nothing.",
  request: {
    body: { content: { 'application/json': { schema: AppleNotificationSchema } }, required: true }
  },
  responses: answers('Apple')
})

const answered = (context: Context, outcome: WebhookAnswer, source: string) => {
  if (outcome === 'off') return context.json(errorBody('not_found', 'There is nothing here.'), 404)
  if (outcome === 'invalid') {
    log('warn', `${source}: refused an event that failed its signature check`)
    return context.json(errorBody('invalid_signature', 'The signature does not check out.'), 400)
  }
  if (outcome === 'unreadable') {
    return context.json(
      errorBody('unreadable_event', 'The event is signed, but not in a format this service reads.'),
      400
    )
  }
  if (outcome === 'retry') {
    return context.json(errorBody('try_again', 'Send the event again later.'), 503)
  }
  log('info', `${source}: event ${outcome}`)
  return context.json({ received: true as const }, 200)
}

export function webhookRoutes(app: OpenAPIHono<AccountEnv>, billing: Billing) {
  const limited = bodyLimit({
    maxSize: webhookBodyLimitKb * 1024,
    onError: context =>
      context.json(errorBody('too_large', `The body is over ${webhookBodyLimitKb} KB.`), 413)
  })
  app.openAPIRegistry.registerPath(stripeWebhook)
  app.openAPIRegistry.registerPath(appleWebhook)

  app.post(stripeWebhook.path, limited, async context =>
    answered(
      context,
      await billing.stripeEvent(
        await context.req.text(),
        context.req.header('stripe-signature') ?? ''
      ),
      'stripe'
    )
  )

  app.post(appleWebhook.path, limited, async context =>
    answered(context, await billing.appleNotification(await context.req.text()), 'apple')
  )
}
