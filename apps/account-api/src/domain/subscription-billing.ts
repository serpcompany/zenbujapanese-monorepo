import type { Language } from '../language'
import {
  type BillingProvider,
  type BillingStore,
  BillingUnavailable,
  type ProviderEvent,
  type StoreBilling,
  type Verified
} from './billing'
import { applyEvent, type EventAnswer, type EventRules } from './billing-events'
import { clientById, type Principal } from './clients'
import { type CloudAccess, type CloudAccessRules, cloudAccess } from './cloud-access'
import { claimAppleTransaction } from './device-purchases'
import {
  type Entitlement,
  entitlementOf,
  type Subscription,
  type SubscriptionKey,
  type SubscriptionStatus
} from './subscriptions'

const endedAtTheProvider = new Set<SubscriptionStatus>(['expired', 'revoked'])

export interface BillingProviders {
  stripe: BillingProvider | null
  apple: StoreBilling | null
}

export interface SubscriptionView {
  entitlement: Entitlement
  cloudAccess: CloudAccess
  appAccountToken: string
  offers: { appStore: readonly string[]; website: readonly string[] }
}

export type Unavailable = { status: 'unavailable' }
export type Checkout =
  | { status: 'created'; url: string }
  | { status: 'already_subscribed'; entitlement: Entitlement }
  | { status: 'unknown_price' | 'no_account' }
  | Unavailable
export type Portal =
  | { status: 'created'; url: string }
  | { status: 'managed_in_app_store' | 'no_customer' | 'no_account' }
  | Unavailable
export type AppleTransaction =
  | { status: 'claimed'; view: SubscriptionView }
  | { status: 'invalid' | 'unknown_product' | 'another_account' | 'no_account' }
  | Unavailable
export type WebhookAnswer = EventAnswer | 'invalid' | 'retry' | 'off'

export interface CheckoutAsk {
  price?: string
  successUrl: string
  cancelUrl: string
  language: Language | null
}

async function unlessUnavailable<T>(work: () => Promise<T>): Promise<T | Unavailable> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof BillingUnavailable) return { status: 'unavailable' }
    throw error
  }
}

const offered = (providers: BillingProviders) => ({
  appStore: providers.apple?.products ?? [],
  website: providers.stripe?.prices ?? []
})

export function createBilling(
  store: BillingStore,
  providers: BillingProviders,
  rules: CloudAccessRules
) {
  const unknownApps = rules.freeClients.filter(id => clientById(id) === null)
  if (unknownApps.length > 0) {
    throw new Error(`Cloud access is free for apps this service doesn't know: ${unknownApps}`)
  }
  const { stripe, apple } = providers
  const eventRules: EventRules = {
    grants: (subscription: Subscription) =>
      (subscription.source === 'stripe'
        ? (stripe?.prices ?? [])
        : (apple?.products ?? [])
      ).includes(subscription.productId),
    orphaned: async (key: SubscriptionKey) => {
      if (key.source === 'stripe') await stripe?.refundAndCancel(key.providerId)
    }
  }

  const entitlement = async (userId: string, now: Date) =>
    entitlementOf(await store.subscriptionsOf(userId), now)

  async function view(principal: Principal, now: Date): Promise<SubscriptionView | null> {
    const account = await store.account(principal.userId)
    const customer = await store.ensureCustomer(principal.userId)
    if (account === null || customer === null) return null
    const held = await entitlement(principal.userId, now)
    return {
      entitlement: held,
      cloudAccess: cloudAccess(
        rules,
        { clientId: principal.clientId, madeAt: account.madeAt, subscribed: held.active },
        now
      ),
      appAccountToken: customer.appAccountToken,
      offers: offered(providers)
    }
  }

  async function webhook(verify: () => Promise<Verified<ProviderEvent>>): Promise<WebhookAnswer> {
    const event = await verify()
    if (event === 'invalid' || event === 'retry') return event
    const answered = await unlessUnavailable(() =>
      store.transaction(tx => applyEvent(tx, event, eventRules))
    )
    return typeof answered === 'string' ? answered : 'retry'
  }

  return {
    rules,
    view,

    async cloudAccess(principal: Principal, now: Date): Promise<CloudAccess | 'no_account'> {
      if (!rules.needsSubscription) return 'free'
      const account = await store.account(principal.userId)
      if (account === null) return 'no_account'
      const subscribed = (await entitlement(principal.userId, now)).active
      return cloudAccess(
        rules,
        { clientId: principal.clientId, madeAt: account.madeAt, subscribed },
        now
      )
    },

    async checkout(principal: Principal, ask: CheckoutAsk, now: Date): Promise<Checkout> {
      if (stripe === null) return { status: 'unavailable' }
      const price = ask.price ?? (stripe.prices.length === 1 ? stripe.prices[0] : undefined)
      if (price === undefined || !stripe.prices.includes(price)) return { status: 'unknown_price' }
      const account = await store.account(principal.userId)
      const customer = await store.ensureCustomer(principal.userId)
      if (account === null || customer === null) return { status: 'no_account' }
      const held = await entitlement(principal.userId, now)
      if (!held.canSubscribe) return { status: 'already_subscribed', entitlement: held }
      return unlessUnavailable(async () => ({
        status: 'created' as const,
        url: await stripe.createCheckout({
          userId: principal.userId,
          email: account.email,
          customerId: customer.stripeCustomerId,
          price,
          successUrl: ask.successUrl,
          cancelUrl: ask.cancelUrl,
          language: ask.language
        })
      }))
    },

    async portal(
      principal: Principal,
      returnUrl: string,
      language: Language | null,
      now: Date
    ): Promise<Portal> {
      if (stripe === null) return { status: 'unavailable' }
      const customer = await store.ensureCustomer(principal.userId)
      if (customer === null) return { status: 'no_account' }
      if ((await entitlement(principal.userId, now)).managedIn === 'app_store') {
        return { status: 'managed_in_app_store' }
      }
      const customerId = customer.stripeCustomerId
      if (customerId === null) return { status: 'no_customer' }
      return unlessUnavailable(async () => ({
        status: 'created' as const,
        url: await stripe.createPortal(customerId, returnUrl, language)
      }))
    },

    async appleTransaction(
      principal: Principal,
      signedTransaction: string,
      now: Date
    ): Promise<AppleTransaction> {
      if (apple === null) return { status: 'unavailable' }
      const verified = await apple.verifyTransaction(signedTransaction)
      if (verified === 'invalid') return { status: 'invalid' }
      if (verified === 'retry') return { status: 'unavailable' }
      if (!apple.products.includes(verified.state.subscription.productId)) {
        return { status: 'unknown_product' }
      }
      const claim = await store.transaction(tx =>
        claimAppleTransaction(tx, principal.userId, verified)
      )
      if (claim !== 'claimed') return { status: claim }
      const claimed = await view(principal, now)
      return claimed ? { status: 'claimed', view: claimed } : { status: 'no_account' }
    },

    stripeEvent: (body: string, signature: string): Promise<WebhookAnswer> =>
      stripe === null ? Promise.resolve('off') : webhook(() => stripe.verifyEvent(body, signature)),

    appleNotification: (body: string): Promise<WebhookAnswer> =>
      apple === null ? Promise.resolve('off') : webhook(() => apple.verifyNotification(body)),

    async endSubscriptions(userId: string): Promise<'ended' | 'unavailable'> {
      const billing = (await store.subscriptionsOf(userId)).filter(
        each => each.source === 'stripe' && !endedAtTheProvider.has(each.status)
      )
      if (billing.length === 0) return 'ended'
      if (stripe === null) return 'unavailable'
      const ended = await unlessUnavailable(async () => {
        for (const each of billing) await stripe.cancel(each.providerId)
        return 'ended' as const
      })
      return ended === 'ended' ? ended : 'unavailable'
    }
  }
}

export type Billing = ReturnType<typeof createBilling>
