import type Stripe from 'stripe'
import { describe, expect, test } from 'vitest'
import { standInStripe } from '../test/stripe'
import { subscriptionState } from './stripe-events'

const stripe = standInStripe()
const dayS = 24 * 60 * 60
const now = new Date()
const nowS = Math.floor(now.getTime() / 1000)

const stateOf = (fields: Parameters<typeof stripe.subscription>[0], graceDays = 0) =>
  subscriptionState(stripe.subscription(fields) as unknown as Stripe.Subscription, graceDays, now)
    ?.subscription

describe("a Stripe subscription's state", () => {
  test('is active through its period while active or in a trial', () => {
    for (const status of ['active', 'trialing']) {
      expect(stateOf({ status, periodStart: nowS, periodEnd: nowS + 30 * dayS })).toMatchObject({
        status: 'active',
        expiresAt: new Date((nowS + 30 * dayS) * 1000),
        willRenew: true
      })
    }
  })

  test('is a billing retry while past due, or a grace period when the owner set one', () => {
    const lapsed = { status: 'past_due', periodStart: nowS - dayS }
    expect(stateOf(lapsed)?.status).toBe('billing_retry')
    expect(stateOf(lapsed, 3)).toMatchObject({
      status: 'grace_period',
      expiresAt: new Date((nowS + 2 * dayS) * 1000)
    })
    expect(stateOf({ ...lapsed, periodStart: nowS - 4 * dayS }, 3)?.status).toBe('billing_retry')
  })

  test('has ended once canceled, or if its first payment never came', () => {
    for (const status of ['canceled', 'incomplete_expired']) {
      expect(stateOf({ status })).toMatchObject({ status: 'expired', willRenew: false })
    }
    expect(stateOf({ status: 'incomplete' })?.status).toBe('pending')
    expect(stateOf({ status: 'unpaid' })?.status).toBe('billing_retry')
    expect(stateOf({ status: 'paused' })?.status).toBe('paused')
  })

  test('names the account its checkout set, and the customer', () => {
    const state = subscriptionState(
      stripe.subscription({
        userId: 'account-1',
        customer: 'cus_1'
      }) as unknown as Stripe.Subscription,
      0,
      now
    )
    expect(state?.hints).toEqual({ userId: 'account-1', stripeCustomerId: 'cus_1' })
  })
})
