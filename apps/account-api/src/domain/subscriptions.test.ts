import { describe, expect, test } from 'vitest'
import {
  entitlementOf,
  hasAccess,
  renewalLeewayMs,
  type Subscription,
  supersedes
} from './subscriptions'

const now = new Date('2027-03-01T12:00:00Z')
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs)
const hour = 60 * 60 * 1000

const subscription = (fields: Partial<Subscription> = {}): Subscription => ({
  source: 'stripe',
  providerId: 'sub_1',
  productId: 'price_monthly',
  status: 'active',
  expiresAt: at(10 * 24 * hour),
  willRenew: true,
  environment: 'test',
  periodStartedAt: at(-20 * 24 * hour),
  stateAt: at(-hour),
  origin: 'provider',
  ...fields
})

describe('a subscription', () => {
  test('gives access through its paid time, and a day past it only while it is set to renew', () => {
    const ended = subscription({ expiresAt: at(-hour) })
    expect(hasAccess(subscription(), now)).toBe(true)
    expect(hasAccess(ended, now)).toBe(true)
    expect(hasAccess({ ...ended, willRenew: false }, now)).toBe(false)
    expect(hasAccess({ ...ended, willRenew: null }, now)).toBe(false)
    expect(hasAccess(subscription({ expiresAt: at(-renewalLeewayMs - 1) }), now)).toBe(false)
  })

  test('gives access through a grace period, and never in a billing retry, a pause, or once revoked', () => {
    expect(hasAccess(subscription({ status: 'grace_period', expiresAt: at(hour) }), now)).toBe(true)
    expect(hasAccess(subscription({ status: 'grace_period', expiresAt: at(-1) }), now)).toBe(false)
    for (const status of ['billing_retry', 'pending', 'paused', 'expired', 'revoked'] as const) {
      expect(hasAccess(subscription({ status }), now), status).toBe(false)
    }
  })
})

describe('a newer state', () => {
  test('replaces an older one by its period, then by when the store said it', () => {
    const current = subscription()
    expect(supersedes(current, null)).toBe(true)
    expect(
      supersedes(subscription({ periodStartedAt: at(0), stateAt: at(-2 * hour) }), current)
    ).toBe(true)
    expect(
      supersedes(subscription({ periodStartedAt: at(-40 * 24 * hour), stateAt: at(0) }), current)
    ).toBe(false)
    expect(supersedes(subscription({ status: 'expired', stateAt: at(0) }), current)).toBe(true)
    expect(supersedes(subscription({ status: 'expired', stateAt: at(-2 * hour) }), current)).toBe(
      false
    )
  })

  test("from the device, takes a store's state for the same period only to revoke it", () => {
    const fromTheStore = subscription({ status: 'grace_period' })
    const device = (status: Subscription['status']) =>
      subscription({ status, origin: 'device', stateAt: at(0) })
    expect(supersedes(device('expired'), fromTheStore)).toBe(false)
    expect(supersedes(device('revoked'), fromTheStore)).toBe(true)
    expect(supersedes({ ...device('active'), periodStartedAt: at(0) }, fromTheStore)).toBe(true)
  })
})

describe("the account's entitlement", () => {
  test('is the subscription giving access, wherever it was bought, and offers no second one', () => {
    const lapsed = subscription({ status: 'expired', stateAt: at(0), expiresAt: at(-24 * hour) })
    const apple = subscription({ source: 'apple', providerId: '1000', productId: 'monthly' })
    expect(entitlementOf([lapsed, apple], now)).toMatchObject({
      status: 'active',
      active: true,
      source: 'apple',
      managedIn: 'app_store',
      canSubscribe: false
    })
  })

  test('shows a billing retry where it can be fixed, and offers nothing while it runs', () => {
    expect(entitlementOf([subscription({ status: 'billing_retry' })], now)).toMatchObject({
      status: 'billing_retry',
      active: false,
      managedIn: 'website',
      canSubscribe: false
    })
  })

  test('shows a lapsed grace period as a billing retry, and an active one past its time as expired', () => {
    expect(
      entitlementOf([subscription({ status: 'grace_period', expiresAt: at(-1) })], now).status
    ).toBe('billing_retry')
    expect(
      entitlementOf([subscription({ expiresAt: at(-2 * renewalLeewayMs) })], now)
    ).toMatchObject({ status: 'expired', active: false, managedIn: null, canSubscribe: true })
  })

  test('is none for an account that never subscribed', () => {
    expect(entitlementOf([], now)).toMatchObject({
      status: 'none',
      active: false,
      canSubscribe: true
    })
  })
})
