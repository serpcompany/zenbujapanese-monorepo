import { createRoute, type OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { Principal } from '../domain/clients'
import type { Billing, SubscriptionView } from '../domain/subscription-billing'
import type { Entitlement } from '../domain/subscriptions'
import { languageHeader, languageOf } from '../language'
import {
  failed,
  malformed,
  needs,
  noScope,
  onTheWebsite,
  refuse,
  tooLarge,
  tooMany,
  unauthorized
} from './accounts'
import type { AccountEnv } from './env'
import { errorBody } from './errors'
import { requestsPerMinute } from './rate-limit'
import { json, refusal } from './refusals'
import {
  AppleTransactionSchema,
  CheckoutRequestSchema,
  LanguageHeaders,
  PlansSchema,
  PortalRequestSchema,
  RedirectSchema,
  SubscriptionSchema
} from './subscription-schemas'

export const cloudDataPaths = ['/v1/sync'] as const

export const subscriptionPath = '/v1/me/subscription'

const billingUnavailable = {
  billing_unavailable:
    "The store didn't answer, or subscribing there isn't set up in this environment. Nothing changed. Try again later."
}

const notOnTheWebsite = "A URL is on none of the website's origins."

const principalIn = (context: Context<AccountEnv>): Principal => ({
  userId: context.get('userId'),
  clientId: context.get('clientId'),
  scopes: context.get('scopes'),
  signedInAt: context.get('signedInAt')
})

const entitlementJson = (entitlement: Entitlement) => ({
  ...entitlement,
  expiresAt: entitlement.expiresAt?.toISOString() ?? null,
  running: entitlement.running.map(each => ({
    ...each,
    expiresAt: each.expiresAt?.toISOString() ?? null
  }))
})

const viewJson = (view: SubscriptionView) => ({
  ...entitlementJson(view.entitlement),
  cloudAccess: view.cloudAccess,
  appAccountToken: view.appAccountToken,
  offers: { appStore: [...view.offers.appStore], website: [...view.offers.website] }
})

export function requireCloudAccess(billing: Billing) {
  return createMiddleware<AccountEnv>(async (context, next) => {
    const access = await billing.cloudAccess(principalIn(context), new Date())
    if (access === 'no_account') return refuse(context)
    if (access === 'subscription_required') {
      return context.json(
        errorBody('subscription_required', 'Syncing needs a subscription. Nothing was applied.'),
        402
      )
    }
    await next()
  })
}

const common = {
  401: unauthorized,
  403: refusal(noScope('subscription')),
  429: tooMany(requestsPerMinute.subscription),
  500: failed
}

const readSubscription = createRoute({
  method: 'get',
  path: subscriptionPath,
  summary: "The account's subscription, and where it's managed",
  description:
    "Read from the service's own records, which each store's events keep current. One subscription stands for the account, wherever it was bought; the app shows the paywall when `cloudAccess` is `subscription_required`, and offers a subscription only when `canSubscribe` is true.",
  security: needs('subscription'),
  responses: { 200: json(SubscriptionSchema, 'The subscription.'), ...common }
})

const readPlans = createRoute({
  method: 'get',
  path: `${subscriptionPath}/plans`,
  summary: "The website's plans, with their prices",
  description:
    "What the website's paywall shows before Checkout: each of `offers.website` with Stripe's name, price, and period, read from Stripe on each request, and the free trial this account would get.",
  security: needs('subscription'),
  responses: {
    200: json(PlansSchema, 'The plans.'),
    503: refusal(billingUnavailable),
    ...common
  }
})

const startCheckout = createRoute({
  method: 'post',
  path: `${subscriptionPath}/checkout`,
  summary: 'Start a subscription on the website, on Stripe Checkout',
  description:
    "Answers the URL of Stripe's hosted Checkout page for one of `offers.website`. The subscription starts when Stripe tells the service it's paid, a few seconds after the learner pays, so the website reads GET /v1/me/subscription again on its success page.",
  security: needs('subscription'),
  request: {
    headers: LanguageHeaders,
    body: { content: { 'application/json': { schema: CheckoutRequestSchema } }, required: true }
  },
  responses: {
    200: json(RedirectSchema, 'Open the URL.'),
    400: refusal({
      bad_request: `${malformed.bad_request} Or: ${notOnTheWebsite}`,
      unknown_price:
        "That price isn't one the website offers, or none was named and it offers several."
    }),
    409: refusal({
      already_subscribed:
        'The account has a subscription that is still running, or a first payment still pending, here or in the App Store. Nothing was started.',
      payment_confirming:
        "The account's last checkout was paid and Stripe hasn't confirmed it to the service yet. Nothing was started; read GET /v1/me/subscription again shortly."
    }),
    413: tooLarge,
    503: refusal(billingUnavailable),
    ...common
  }
})

const openPortal = createRoute({
  method: 'post',
  path: `${subscriptionPath}/portal`,
  summary: "Manage a website subscription, in Stripe's customer portal",
  security: needs('subscription'),
  request: {
    headers: LanguageHeaders,
    body: { content: { 'application/json': { schema: PortalRequestSchema } }, required: true }
  },
  responses: {
    200: json(RedirectSchema, 'Open the URL.'),
    400: refusal({ bad_request: `${malformed.bad_request} Or: ${notOnTheWebsite}` }),
    404: refusal({
      no_subscription:
        'The account has never subscribed on the website. An App Store subscription is managed in the App Store.'
    }),
    413: tooLarge,
    503: refusal(billingUnavailable),
    ...common
  }
})

const postAppleTransaction = createRoute({
  method: 'post',
  path: `${subscriptionPath}/apple`,
  summary: 'Tell the service about an App Store purchase or restore',
  description:
    "The app sends each verified transaction StoreKit 2 gives it, so the subscription applies at once; App Store Server Notifications keep it current after. A purchase carries the account's `appAccountToken`, and belongs to that account. One without a token, such as an offer code redeemed in the App Store, belongs to the first account that sends it.",
  security: needs('subscription'),
  request: {
    body: { content: { 'application/json': { schema: AppleTransactionSchema } }, required: true }
  },
  responses: {
    200: json(SubscriptionSchema, 'The subscription, with the purchase applied.'),
    400: refusal({
      ...malformed,
      invalid_transaction:
        "Apple didn't sign it for this app and environment, or it isn't an auto-renewable subscription.",
      unknown_product: "It's for a product the app doesn't offer."
    }),
    409: refusal({
      subscription_belongs_to_another_account:
        "This Apple ID's subscription belongs to another Zenbu account. Sign in to that account to use it."
    }),
    413: tooLarge,
    503: refusal(billingUnavailable),
    ...common
  }
})

const unavailableBody = errorBody('billing_unavailable', billingUnavailable.billing_unavailable)

export function subscriptionRoutes(
  app: OpenAPIHono<AccountEnv>,
  billing: Billing,
  websiteOrigins: readonly string[]
) {
  const offTheWebsite = (context: Context, ...urls: string[]) =>
    urls.some(url => !onTheWebsite(url, websiteOrigins))
      ? context.json(errorBody('bad_request', notOnTheWebsite), 400)
      : null

  app.openapi(readSubscription, async context => {
    const view = await billing.view(principalIn(context), new Date())
    return view ? context.json(viewJson(view), 200) : refuse(context)
  })

  app.openapi(readPlans, async context => {
    const plans = await billing.plans(principalIn(context))
    return plans.status === 'listed'
      ? context.json({ plans: plans.plans, trialDays: plans.trialDays }, 200)
      : context.json(unavailableBody, 503)
  })

  app.openapi(startCheckout, async context => {
    const ask = context.req.valid('json')
    const refused = offTheWebsite(context, ask.successUrl, ask.cancelUrl)
    if (refused) return refused
    const language = languageOf(context.req.valid('header')[languageHeader])
    const checkout = await billing.checkout(principalIn(context), { ...ask, language }, new Date())
    switch (checkout.status) {
      case 'created':
        return context.json({ url: checkout.url }, 200)
      case 'no_account':
        return refuse(context)
      case 'unknown_price':
        return context.json(errorBody('unknown_price', 'The website offers no such price.'), 400)
      case 'already_subscribed':
        return context.json(
          errorBody(
            'already_subscribed',
            `The account's subscription is managed in ${checkout.entitlement.managedIn === 'app_store' ? 'the App Store' : 'the website'}.`
          ),
          409
        )
      case 'confirming':
        return context.json(
          errorBody('payment_confirming', 'Stripe is still confirming the last checkout.'),
          409
        )
      default:
        return context.json(unavailableBody, 503)
    }
  })

  app.openapi(openPortal, async context => {
    const { returnUrl } = context.req.valid('json')
    const refused = offTheWebsite(context, returnUrl)
    if (refused) return refused
    const language = languageOf(context.req.valid('header')[languageHeader])
    const portal = await billing.portal(principalIn(context), returnUrl, language)
    switch (portal.status) {
      case 'created':
        return context.json({ url: portal.url }, 200)
      case 'no_account':
        return refuse(context)
      case 'no_customer':
        return context.json(errorBody('no_subscription', 'Nothing was bought on the website.'), 404)
      default:
        return context.json(unavailableBody, 503)
    }
  })

  app.openapi(postAppleTransaction, async context => {
    const { signedTransaction } = context.req.valid('json')
    const claim = await billing.appleTransaction(
      principalIn(context),
      signedTransaction,
      new Date()
    )
    switch (claim.status) {
      case 'claimed':
        return context.json(viewJson(claim.view), 200)
      case 'no_account':
        return refuse(context)
      case 'invalid':
        return context.json(
          errorBody('invalid_transaction', "Apple didn't sign that transaction for this app."),
          400
        )
      case 'unknown_product':
        return context.json(errorBody('unknown_product', "The app doesn't offer that."), 400)
      case 'another_account':
        return context.json(
          errorBody(
            'subscription_belongs_to_another_account',
            'That subscription belongs to another Zenbu account.'
          ),
          409
        )
      default:
        return context.json(unavailableBody, 503)
    }
  })
}
