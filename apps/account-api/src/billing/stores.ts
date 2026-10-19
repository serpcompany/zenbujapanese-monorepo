import type { BillingRules } from '../domain/subscription-billing'
import { billingRetryWindowMs } from '../domain/subscriptions'
import { appStoreSource } from './app-store-states'
import { stripeSource } from './stripe-events'

export const storeTraits: BillingRules['stores'] = {
  [appStoreSource]: { managedIn: 'app_store', retryWindowMs: billingRetryWindowMs },
  [stripeSource]: { managedIn: 'website', retryWindowMs: Number.POSITIVE_INFINITY }
}
