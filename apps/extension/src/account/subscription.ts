import type { KeptSubscription, RunningSubscription } from '../shared/account'
import { accountLabels } from './labels'

const words = accountLabels.subscription

export type SubscriptionView = {
  line: string
  detail: string | null
  action: 'subscribe' | 'manage' | null
}

const dateOf = (at: string) =>
  new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(at))

function lineOf(held: RunningSubscription): string {
  if (held.status !== 'active') return words.status[held.status] ?? words.subscribed
  if (held.expiresAt === null) return words.subscribed
  const date = dateOf(held.expiresAt)
  return held.willRenew === false ? words.ends(date) : words.renews(date)
}

export function subscriptionView(subscription: KeptSubscription | null): SubscriptionView {
  if (subscription === null) return { line: words.notChecked, detail: null, action: null }
  const website = subscription.running.find(held => held.managedIn === 'website')
  const appStore = subscription.running.find(held => held.managedIn === 'app_store')
  const held = website ?? appStore
  if (held === undefined) {
    return {
      line: words.none,
      detail: null,
      action: subscription.canSubscribe ? 'subscribe' : null
    }
  }
  return {
    line: lineOf(held),
    detail: appStore ? words.appStore : null,
    action: website ? 'manage' : null
  }
}

export const appStoreRuns = (subscription: KeptSubscription | null) =>
  subscription?.running.some(held => held.managedIn === 'app_store') ?? false

export const websiteRuns = (subscription: KeptSubscription | null) =>
  subscription?.running.some(held => held.managedIn === 'website') ?? false
