import { z } from '@hono/zod-openapi'
import { subscriptionStatuses } from '../domain/subscriptions'
import { languageHeader } from '../language'

export const subscriptionRequired = {
  subscription_required:
    "Syncing and the account's other cloud features need a subscription, and this account has none that is active. Nothing was applied: keep the changes on the device, and show the paywall. GET /v1/me/subscription says what to offer."
}

const statusMeanings = {
  none: 'The account has never had a subscription.',
  active: 'Paid through `expiresAt`. It renews then unless `willRenew` is false.',
  grace_period:
    "A renewal's payment failed, and the store is retrying it. The subscription's features stay on until `expiresAt`.",
  billing_retry:
    "A renewal's payment failed, and the store is retrying it. The features are off until it's paid.",
  pending: 'The first payment is still being made. The features are off until it is.',
  paused: 'Paused where it was bought. The features are off until it resumes.',
  expired: 'It ended: canceled, or never paid again. The features are off.',
  revoked: 'Refunded, or revoked by the store. The features are off.'
}

const describe = (meanings: Record<string, string>) =>
  Object.entries(meanings)
    .map(([value, meaning]) => `\`${value}\`: ${meaning}`)
    .join(' ')

const RunningSchema = z
  .object({
    source: z.string(),
    productId: z.string(),
    status: z.enum(subscriptionStatuses),
    expiresAt: z.iso.datetime().nullable(),
    willRenew: z.boolean().nullable(),
    managedIn: z.enum(['app_store', 'website'])
  })
  .openapi('RunningSubscription', {
    description: 'A subscription still running at its store, and where it is managed.'
  })

export const SubscriptionSchema = z
  .object({
    status: z
      .enum(['none', ...subscriptionStatuses])
      .openapi({ description: describe(statusMeanings) }),
    active: z.boolean().openapi({
      description:
        "Whether the subscription's features are on now: `status` is `active`, or `grace_period`, and `expiresAt` hasn't passed."
    }),
    source: z.string().nullable().openapi({
      description: 'Where it was bought: `apple`, in the App Store, or `stripe`, on the website.'
    }),
    productId: z.string().nullable().openapi({
      description: "The App Store product's ID, or the Stripe price's."
    }),
    expiresAt: z.iso.datetime().nullable().openapi({
      description:
        'When the paid time, or the grace period, ends. A subscription set to renew keeps its features for a day past it while the renewal reaches the service.'
    }),
    willRenew: z.boolean().nullable().openapi({
      description: 'Whether it renews at `expiresAt`. `null` until the store has said.'
    }),
    managedIn: z.enum(['app_store', 'website']).nullable().openapi({
      description:
        "Where the learner changes, cancels, or fixes the payment of a subscription that is still running: `app_store`, in the App Store's subscription settings, or `website`, through POST /v1/me/subscription/portal. `null` when nothing runs."
    }),
    running: z.array(RunningSchema).openapi({
      description:
        'Every subscription still running for the account, in either store, each managed where it was bought. Usually one; two when the learner subscribed in both, which the app and the website show, so each can be managed or canceled where it was bought.'
    }),
    canSubscribe: z.boolean().openapi({
      description:
        'Whether to offer a subscription. False while one runs anywhere, in a grace period, a billing retry, or a pause too, so a learner is never offered a second.'
    }),
    cloudAccess: z.enum(['subscribed', 'free', 'subscription_required']).openapi({
      description:
        "What POST /v1/sync does for this app now: `subscribed` and `free` sync, and `subscription_required` refuses with `402 subscription_required`, the app's cue for the paywall."
    }),
    appAccountToken: z.uuid().openapi({
      description:
        "The account's `appAccountToken`: the app sets it on every App Store purchase, so the purchase belongs to this account. It never changes."
    }),
    offers: z
      .object({
        appStore: z.array(z.string()).openapi({
          description: 'The App Store product IDs the app offers. Empty where the App Store is off.'
        }),
        website: z.array(z.string()).openapi({
          description: 'The Stripe price IDs the website offers. Empty where Stripe is off.'
        })
      })
      .openapi({ description: 'What to offer when `canSubscribe` is true.' })
  })
  .openapi('Subscription')

const PlanSchema = z
  .object({
    price: z.string().openapi({ description: 'The Stripe price, one of `offers.website`.' }),
    name: z.string().openapi({ description: "Stripe's name for the product." }),
    amount: z.number().int().openapi({
      description:
        "Each period's price in the currency's smallest unit, as Stripe has it: cents, or yen."
    }),
    currency: z
      .string()
      .openapi({ description: 'Its ISO 4217 code, in lowercase, as Stripe has it.' }),
    interval: z.enum(['day', 'week', 'month', 'year']),
    intervalCount: z
      .number()
      .int()
      .openapi({ description: 'How many intervals each period lasts.' })
  })
  .openapi('WebsitePlan')

export const PlansSchema = z
  .object({
    plans: z.array(PlanSchema).openapi({
      description:
        'Each of `offers.website`, in its order, as Stripe describes it. Empty where Stripe is off.'
    }),
    trialDays: z.number().int().nullable().openapi({
      description:
        'The free trial a checkout gives this account, or null: none is set, or the account has subscribed before.'
    })
  })
  .openapi('WebsitePlans')

const websiteUrl = (what: string) =>
  z
    .url()
    .max(2048)
    .openapi({ description: `${what}, on one of the website's origins.` })

export const CheckoutRequestSchema = z
  .strictObject({
    price: z.string().min(1).max(255).optional().openapi({
      description: 'One of `offers.website`. It may be left out when the website offers one price.'
    }),
    successUrl: websiteUrl('Where Stripe sends the learner after paying'),
    cancelUrl: websiteUrl('Where Stripe sends the learner who goes back without paying')
  })
  .openapi('CheckoutRequest')

export const PortalRequestSchema = z
  .strictObject({ returnUrl: websiteUrl("Where Stripe's portal sends the learner back to") })
  .openapi('PortalRequest')

export const AppleTransactionSchema = z
  .strictObject({
    signedTransaction: z.string().min(1).max(16_384).openapi({
      description:
        "StoreKit 2's `Transaction.jwsRepresentation`, after a purchase, a restore, or an update from `Transaction.updates`."
    })
  })
  .openapi('AppleTransaction')

export const RedirectSchema = z
  .object({
    url: z.url().openapi({ description: "Stripe's hosted page. Open it in the browser." })
  })
  .openapi('Redirect')

export const LanguageHeaders = z.object({
  [languageHeader]: z.string().optional().openapi({
    example: 'ja',
    description:
      "The page's language, `ja` or `en`, which Stripe's page shows. Any other, or none, lets Stripe choose from the browser."
  })
})

export const StripeEventSchema = z
  .looseObject({ id: z.string(), type: z.string() })
  .openapi('StripeEvent', { description: "A Stripe event, in the webhook endpoint's API version." })

export const StripeWebhookHeaders = z.object({
  'stripe-signature': z.string().optional().openapi({
    description: "Stripe's signature of the body, checked with `STRIPE_WEBHOOK_SECRET`."
  })
})

export const AppleNotificationSchema = z
  .object({
    signedPayload: z.string().openapi({
      description:
        "App Store Server Notifications V2's signed payload, checked with Apple's root certificate."
    })
  })
  .openapi('AppleNotification')

export const ReceivedSchema = z.object({ received: z.literal(true) }).openapi('Received', {
  description: 'The event was taken, or was a repeat of one already taken.'
})
