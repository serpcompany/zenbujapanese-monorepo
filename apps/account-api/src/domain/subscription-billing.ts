import { log } from '@zenbu/node-service/log'
import { failureFields } from '../failure'
import type { Language } from '../language'
import {
  type BillingProvider,
  type BillingStore,
  BillingUnavailable,
  type ProviderEvent,
  type StoreBilling,
  type Verified,
  type WebsitePlan
} from './billing'
import { applyEvent, type EventAnswer, type EventRules } from './billing-events'
import { appSellingTheSubscription, clientById, type Principal } from './clients'
import { type CloudAccess, type CloudAccessRules, cloudAccess } from './cloud-access'
import { claimAppleTransaction } from './device-purchases'
import {
  billingRetryWindowMs,
  type Entitlement,
  entitlementOf,
  type ManagedIn,
  type StoredSubscription,
  type StoreTraits,
  type StoreTraitsOf,
  type Subscription,
  type SubscriptionKey,
  type SubscriptionSource,
  type SubscriptionStatus
} from './subscriptions'

export interface BillingProviders {
  web: BillingProvider | null
  store: StoreBilling | null
}

export interface BillingRules {
  cloud: CloudAccessRules
  storeTesting: { environment: string; accounts: readonly string[] | null } | null
  stores: Readonly<Record<SubscriptionSource, StoreTraits>>
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
type Plans = { status: 'listed'; plans: WebsitePlan[]; trialDays: number | null } | Unavailable
type Portal =
  | { status: 'created'; url: string }
  | { status: 'no_customer' | 'no_account' }
  | Unavailable
export type AppleTransaction =
  | { status: 'claimed'; view: SubscriptionView }
  | { status: 'invalid' | 'unknown_product' | 'another_account' | 'no_account' }
  | Unavailable
export type WebhookAnswer = EventAnswer | 'invalid' | 'unreadable' | 'retry' | 'off'
export interface Ended {
  status: 'ended' | 'unavailable'
  appStoreSubscriptionContinues: boolean
}

export interface CheckoutAsk {
  price?: string
  successUrl: string
  cancelUrl: string
  language: Language | null
}

const unknownStore: StoreTraits = { managedIn: 'website', retryWindowMs: billingRetryWindowMs }
const endedAtTheStore = new Set<SubscriptionStatus>(['expired', 'revoked'])

const mayStillBill = (subscription: Subscription, now: Date) =>
  !endedAtTheStore.has(subscription.status) &&
  (subscription.expiresAt ?? new Date(subscription.stateAt.getTime() + billingRetryWindowMs)) > now

async function unlessUnavailable<T>(work: () => Promise<T>): Promise<T | Unavailable> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof BillingUnavailable) return { status: 'unavailable' }
    throw error
  }
}

function checkedRules(providers: BillingProviders, rules: BillingRules) {
  const unknownApps = rules.cloud.freeClients.filter(id => clientById(id) === null)
  if (unknownApps.length > 0) {
    throw new Error(`Cloud access is free for apps this service doesn't know: ${unknownApps}`)
  }
  const appPays =
    rules.cloud.needsSubscription && !rules.cloud.freeClients.includes(appSellingTheSubscription)
  if (appPays && providers.store === null) {
    throw new Error(
      `Cloud access can't need a subscription in ${appSellingTheSubscription} without the App Store: the app must sell it as an in-app purchase (App Review 3.1.1)`
    )
  }
}

export function createBilling(
  store: BillingStore,
  providers: BillingProviders,
  rules: BillingRules
) {
  checkedRules(providers, rules)
  const { web, store: appStore } = providers
  const stores: StoreTraitsOf = source => rules.stores[source] ?? unknownStore
  const managedIn = (source: string): ManagedIn => stores(source).managedIn

  const counts = (subscription: StoredSubscription, email: string) => {
    const testing = rules.storeTesting
    if (testing === null || subscription.environment !== testing.environment) return true
    return testing.accounts === null || testing.accounts.includes(email.toLowerCase())
  }

  const eventRules: EventRules = {
    grants: (subscription: Subscription) =>
      (subscription.source === web?.source ? web.prices : (appStore?.products ?? [])).includes(
        subscription.productId
      ),
    gracePeriodDays: (subscription: Subscription) =>
      subscription.source === web?.source ? web.gracePeriodDays : 0,
    refundsAndCancels: (key: SubscriptionKey) => key.source === web?.source,
    stores,
    counts
  }

  async function entitlement(userId: string, email: string, now: Date) {
    const subscriptions = (await store.subscriptionsOf(userId)).filter(each => counts(each, email))
    return entitlementOf(subscriptions, now, stores)
  }

  async function view(principal: Principal, now: Date): Promise<SubscriptionView | null> {
    const account = await store.account(principal.userId)
    const customer = await store.ensureCustomer(principal.userId)
    if (account === null || customer === null) return null
    const held = await entitlement(principal.userId, account.email, now)
    return {
      entitlement: held,
      cloudAccess: cloudAccess(
        rules.cloud,
        { clientId: principal.clientId, madeAt: account.madeAt, subscribed: held.active },
        now
      ),
      appAccountToken: customer.appAccountToken,
      offers: { appStore: appStore?.products ?? [], website: web?.prices ?? [] }
    }
  }

  let settling: Promise<void> | null = null

  async function settleOne(): Promise<boolean> {
    const action = await store.claimOwedAction()
    if (action === null) return false
    try {
      if (action.source !== web?.source) throw new BillingUnavailable('no provider for it')
      await web.refundAndCancel(action.subscriptionId)
      await store.settleOwedAction(action.id, null)
    } catch (error) {
      const failure = error instanceof Error ? error.message : 'failed'
      const settled = await store.settleOwedAction(action.id, failure)
      const fields = { subscription: action.subscriptionId, attempts: action.attempts, failure }
      if (settled === 'gave_up') {
        log('error', 'billing: gave up on an owed refund and cancel; end it by hand', fields)
      } else {
        log('warn', "billing: an owed refund and cancel failed; it's tried again", fields)
      }
    }
    return true
  }

  function settleOwed(): Promise<void> {
    settling ??= (async () => {
      try {
        while (await settleOne()) {}
      } finally {
        settling = null
      }
    })()
    return settling
  }

  const settleInTheBackground = () =>
    void settleOwed().catch(error =>
      log('error', 'billing: settling owed refunds failed', failureFields(error))
    )

  async function webhook(verify: () => Promise<Verified<ProviderEvent>>): Promise<WebhookAnswer> {
    const event = await verify()
    if (typeof event === 'string') return event
    if (await store.eventRecorded(event.source, event.id)) return 'duplicate'
    const answered = await unlessUnavailable(async () => {
      const state = event.subscription ? await event.subscription.read() : null
      return store.transaction(tx => applyEvent(tx, event, state, eventRules))
    })
    if (typeof answered !== 'string') return 'retry'
    settleInTheBackground()
    return answered
  }

  return {
    view,
    settleOwed,

    async cloudAccess(principal: Principal, now: Date): Promise<CloudAccess | 'no_account'> {
      if (!rules.cloud.needsSubscription) return 'free'
      const account = await store.account(principal.userId)
      if (account === null) return 'no_account'
      const subscribed = (await entitlement(principal.userId, account.email, now)).active
      return cloudAccess(
        rules.cloud,
        { clientId: principal.clientId, madeAt: account.madeAt, subscribed },
        now
      )
    },

    async checkout(principal: Principal, ask: CheckoutAsk, now: Date): Promise<Checkout> {
      if (web === null) return { status: 'unavailable' }
      const price = ask.price ?? (web.prices.length === 1 ? web.prices[0] : undefined)
      if (price === undefined || !web.prices.includes(price)) return { status: 'unknown_price' }
      const account = await store.account(principal.userId)
      const customer = await store.ensureCustomer(principal.userId)
      if (account === null || customer === null) return { status: 'no_account' }
      const subscriptions = await store.subscriptionsOf(principal.userId)
      const held = entitlementOf(
        subscriptions.filter(each => counts(each, account.email)),
        now,
        stores
      )
      if (!held.canSubscribe) return { status: 'already_subscribed', entitlement: held }
      return unlessUnavailable(async () => ({
        status: 'created' as const,
        url: await web.createCheckout({
          userId: principal.userId,
          email: account.email,
          customerId: customer.stripeCustomerId,
          price,
          successUrl: ask.successUrl,
          cancelUrl: ask.cancelUrl,
          language: ask.language,
          firstSubscription: subscriptions.length === 0
        })
      }))
    },

    async plans(principal: Principal): Promise<Plans> {
      if (web === null) return { status: 'listed', plans: [], trialDays: null }
      const subscriptions = await store.subscriptionsOf(principal.userId)
      return unlessUnavailable(async () => ({
        status: 'listed' as const,
        plans: await web.describePrices(),
        trialDays: subscriptions.length === 0 ? web.trialDays : null
      }))
    },

    async portal(principal: Principal, returnUrl: string, language: Language | null) {
      if (web === null) return { status: 'unavailable' } satisfies Portal
      const customer = await store.ensureCustomer(principal.userId)
      if (customer === null) return { status: 'no_account' } satisfies Portal
      const customerId = customer.stripeCustomerId
      if (customerId === null) return { status: 'no_customer' } satisfies Portal
      return unlessUnavailable(async () => ({
        status: 'created' as const,
        url: await web.createPortal(customerId, returnUrl, language)
      }))
    },

    async appleTransaction(
      principal: Principal,
      signedTransaction: string,
      now: Date
    ): Promise<AppleTransaction> {
      if (appStore === null) return { status: 'unavailable' }
      const verified = await appStore.verifyTransaction(signedTransaction)
      if (verified === 'invalid' || verified === 'unreadable') return { status: 'invalid' }
      if (verified === 'retry') return { status: 'unavailable' }
      if (!appStore.products.includes(verified.state.subscription.productId)) {
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
      web === null ? Promise.resolve('off') : webhook(() => web.verifyEvent(body, signature)),

    appleNotification: (body: string): Promise<WebhookAnswer> =>
      appStore === null ? Promise.resolve('off') : webhook(() => appStore.verifyNotification(body)),

    async catchUpOnStoreNotifications(): Promise<number> {
      if (appStore === null) return 0
      let applied = 0
      for (const body of await appStore.recentNotifications()) {
        try {
          if ((await webhook(() => appStore.verifyNotification(body))) === 'applied') applied += 1
        } catch (error) {
          log('error', "apple: couldn't apply a notification it caught up on", failureFields(error))
        }
      }
      return applied
    },

    async canEndSubscriptions(userId: string, now: Date): Promise<boolean> {
      const billing = (await store.subscriptionsOf(userId)).filter(
        each => managedIn(each.source) === 'website' && mayStillBill(each, now)
      )
      return billing.every(each => each.source === web?.source)
    },

    async endSubscriptions(userId: string, now: Date): Promise<Ended> {
      const subscriptions = await store.subscriptionsOf(userId)
      const running = entitlementOf(subscriptions, now, stores).running
      const appStoreSubscriptionContinues = running.some(
        each => each.managedIn === 'app_store' && each.willRenew !== false
      )
      const billing = subscriptions.filter(
        each => managedIn(each.source) === 'website' && mayStillBill(each, now)
      )
      if (billing.length === 0) return { status: 'ended', appStoreSubscriptionContinues }
      if (web === null || billing.some(each => each.source !== web.source)) {
        return { status: 'unavailable', appStoreSubscriptionContinues }
      }
      const ended = await unlessUnavailable(async () => {
        for (const each of billing) await web.cancel(each.providerId)
        return 'ended' as const
      })
      return {
        status: ended === 'ended' ? 'ended' : 'unavailable',
        appStoreSubscriptionContinues
      }
    }
  }
}

export type Billing = ReturnType<typeof createBilling>
