import { describe, expect, test } from 'vitest'
import { noBillingStore } from '../test/app'
import type { StoreBilling } from './billing'
import { type CloudAccessRules, cloudAccess, cloudIsFree } from './cloud-access'
import { createBilling } from './subscription-billing'

const now = new Date('2027-03-01T00:00:00Z')
const paid: CloudAccessRules = { ...cloudIsFree, needsSubscription: true }
const account = {
  clientId: 'zenbu-ios',
  madeAt: new Date('2027-02-01T00:00:00Z'),
  subscribed: false
}

describe('cloud access', () => {
  test('is free for everyone until the owner turns the subscription on', () => {
    expect(cloudAccess(cloudIsFree, account, now)).toBe('free')
    expect(cloudAccess(cloudIsFree, { ...account, subscribed: true }, now)).toBe('subscribed')
  })

  test('needs a subscription once it is on', () => {
    expect(cloudAccess(paid, account, now)).toBe('subscription_required')
    expect(cloudAccess(paid, { ...account, subscribed: true }, now)).toBe('subscribed')
  })

  test('stays free for the apps the owner names', () => {
    const rules = { ...paid, freeClients: ['tomodachi'] }
    expect(cloudAccess(rules, { ...account, clientId: 'tomodachi' }, now)).toBe('free')
    expect(cloudAccess(rules, account, now)).toBe('subscription_required')
  })

  test('stays free for everyone until a grace period ends', () => {
    const rules = { ...paid, freeUntil: new Date('2027-04-01T00:00:00Z') }
    expect(cloudAccess(rules, account, now)).toBe('free')
    expect(cloudAccess(rules, account, new Date('2027-04-01T00:00:00Z'))).toBe(
      'subscription_required'
    )
  })

  test('stays free for accounts made before a date, and not for those made after', () => {
    const rules = { ...paid, freeForAccountsMadeBefore: new Date('2027-01-01T00:00:00Z') }
    expect(cloudAccess(rules, { ...account, madeAt: new Date('2026-12-31T00:00:00Z') }, now)).toBe(
      'free'
    )
    expect(cloudAccess(rules, account, now)).toBe('subscription_required')
  })

  const billingWith = (cloud: CloudAccessRules, store: StoreBilling | null = null) =>
    createBilling(noBillingStore, { web: null, store }, { cloud, storeTesting: null })

  test("refuses to leave it free for an app the service doesn't know", () => {
    expect(() => billingWith({ ...paid, freeClients: ['tomodachi', 'someone-elses-app'] })).toThrow(
      /someone-elses-app/
    )
  })

  test("refuses to need a subscription in the iOS app that the App Store can't sell", () => {
    expect(() => billingWith(paid)).toThrow(/App Review 3.1.1/)
    expect(() => billingWith({ ...paid, freeClients: ['zenbu-ios'] })).not.toThrow()
  })
})
