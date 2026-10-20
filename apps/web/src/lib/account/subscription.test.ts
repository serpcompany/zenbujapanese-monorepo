import { describe, expect, test } from 'vitest'
import { getDictionary } from '../i18n/dictionary'
import type { HeldSubscription } from './answers'
import { detailOf, renewsInTheAppStore } from './subscription'

const words = (locale: 'en' | 'ja') => getDictionary(locale).account.subscription

const held = (fields: Partial<HeldSubscription> = {}): HeldSubscription => ({
  status: 'active',
  expiresAt: '2026-11-18T20:00:00.000Z',
  willRenew: true,
  managedIn: 'website',
  ...fields
})

describe("a subscription's detail", () => {
  test("says when it renews on the learner's own calendar day, not the UTC one", () => {
    expect(detailOf(held(), 'ja', words('ja'), 'Asia/Tokyo')).toBe('2026年11月19日に更新されます。')
    expect(detailOf(held(), 'en', words('en'), 'America/Los_Angeles')).toBe(
      'Renews on November 18, 2026.'
    )
  })

  test('says to keep syncing in a grace period, and to sync again once payments failed', () => {
    expect(detailOf(held({ status: 'grace_period' }), 'en', words('en'))).toContain(
      'to keep syncing'
    )
    expect(detailOf(held({ status: 'billing_retry' }), 'en', words('en'))).toContain(
      'to sync again'
    )
  })
})

test('an App Store subscription keeps billing past deletion only while it renews', () => {
  const answer = (willRenew: boolean) => ({
    latest: null,
    running: [held({ managedIn: 'app_store', willRenew })],
    canSubscribe: false,
    cloudAccess: 'subscribed' as const,
    websitePrices: [],
    appStoreProducts: []
  })
  expect(renewsInTheAppStore(answer(true))).toBe(true)
  expect(renewsInTheAppStore(answer(false))).toBe(false)
})
