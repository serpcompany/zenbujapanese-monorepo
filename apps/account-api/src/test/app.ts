import type { BillingStore } from '../domain/billing'
import { cloudIsFree } from '../domain/cloud-access'
import { createBilling } from '../domain/subscription-billing'
import type { AppOptions } from '../http/app'

export const noBillingStore: BillingStore = {
  account: async () => null,
  ensureCustomer: async () => null,
  subscriptionsOf: async () => [],
  eventRecorded: async () => false,
  transaction: () => Promise.reject(new Error('the stand-in app has no database')),
  claimOwedActions: async () => [],
  settleOwedAction: async () => {}
}

export const standIns: AppOptions = {
  release: 'abc123def456',
  databaseReady: async () => true,
  auth: {
    handler: () =>
      Promise.resolve(
        Response.json({ code: 'INVALID_OTP', message: 'Invalid OTP' }, { status: 400 })
      )
  },
  accounts: {
    profile: async () => null,
    updateProfile: async () => null,
    sync: async () => ({ status: 'no_account' })
  },
  deleteAccount: async () => ({ status: 'no_account', appStoreSubscriptionContinues: false }),
  billing: createBilling(
    noBillingStore,
    { web: null, store: null },
    { cloud: cloudIsFree, storeTesting: null }
  ),
  verifyAccessToken: async () => null,
  allowedOrigins: [],
  devMailbox: null
}
