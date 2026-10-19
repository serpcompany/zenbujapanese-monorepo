import type { Locale } from '../i18n/config'
import { countOf, fill, formatDate } from '../i18n/format'
import { localizedPath } from '../i18n/paths'
import type { HeldSubscription, Plan, Subscription } from './answers'
import type { AccountText } from './messages'
import { accountPages } from './pages'

export const appStoreSubscriptions = 'https://apps.apple.com/account/subscriptions'

export const checkAgainAfterMs = [1000, 2000, 4000, 8000, 15_000] as const

type Words = AccountText['subscription']

export function shownSubscriptions(subscription: Subscription): HeldSubscription[] {
  if (subscription.running.length > 0) return subscription.running
  return subscription.latest ? [subscription.latest] : []
}

const needsOne = (subscription: Subscription) =>
  subscription.canSubscribe && subscription.cloudAccess === 'subscription_required'

export const offersOnTheWebsite = (subscription: Subscription) =>
  needsOne(subscription) && subscription.websitePrices.length > 0

export const offersOnlyInTheApp = (subscription: Subscription) =>
  needsOne(subscription) &&
  subscription.websitePrices.length === 0 &&
  subscription.appStoreProducts.length > 0

export const runsOnTheWebsite = (subscription: Subscription) =>
  subscription.running.some(held => held.managedIn === 'website')

export const runsInTheAppStore = (subscription: Subscription | null | undefined) =>
  subscription?.running.some(held => held.managedIn === 'app_store') ?? false

export const isShown = (subscription: Subscription) =>
  shownSubscriptions(subscription).length > 0 ||
  offersOnTheWebsite(subscription) ||
  offersOnlyInTheApp(subscription)

export function priceOf(plan: Plan, locale: Locale, words: Words): string {
  const format = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: plan.currency.toUpperCase()
  })
  const digits = format.resolvedOptions().maximumFractionDigits ?? 2
  const price = format.format(plan.amount / 10 ** digits)
  const period =
    plan.intervalCount === 1
      ? words.per[plan.interval]
      : countOf(words.every[plan.interval], plan.intervalCount, locale)
  return fill(words.planPrice, { price, period })
}

const dayOf = (moment: string) => moment.slice(0, 10)

export function detailOf(held: HeldSubscription, locale: Locale, words: Words): string | null {
  if (held.status === 'grace_period' || held.status === 'billing_retry') {
    return held.managedIn === 'website' ? words.fixPaymentWebsite : words.fixPaymentAppStore
  }
  if (held.status === 'pending') return words.pendingDetail
  if (held.status !== 'active' || held.expiresAt === null) return null
  const date = formatDate(dayOf(held.expiresAt), locale)
  return fill(held.willRenew === false ? words.ends : words.renews, { date })
}

export function accountPageUrl(locale: Locale, query = ''): string {
  return `${window.location.origin}${localizedPath(accountPages.account.path, locale)}${query}`
}

export const returnedFromCheckout = (searchParams: Record<string, unknown>) =>
  searchParams.subscribed !== undefined
