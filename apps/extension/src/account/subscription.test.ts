import { describe, expect, it } from 'vitest'
import type { KeptSubscription, RunningSubscription } from '../shared/account'
import { subscription } from '../test/account-stand-in'
import { accountLabels } from './labels'
import { subscriptionView } from './subscription'

const words = accountLabels.subscription

const running = (...held: Partial<RunningSubscription>[]): KeptSubscription => ({
  ...subscription,
  canSubscribe: false,
  running: held.map(each => ({
    managedIn: 'website',
    status: 'active',
    expiresAt: '2026-11-30T00:00:00Z',
    willRenew: true,
    ...each
  }))
})

describe('subscriptionView', () => {
  it('says the subscription is not checked before the service has answered', () => {
    expect(subscriptionView(null)).toEqual({ line: words.notChecked, detail: null, action: null })
  })

  it('offers Subscribe… only to a learner who can subscribe', () => {
    expect(subscriptionView(subscription)).toMatchObject({ line: words.none, action: 'subscribe' })
    expect(subscriptionView({ ...subscription, canSubscribe: false }).action).toBeNull()
  })

  it('says when a website subscription renews or ends, and offers to manage it', () => {
    expect(subscriptionView(running({}))).toEqual({
      line: words.renews('November 30, 2026'),
      detail: null,
      action: 'manage'
    })
    expect(subscriptionView(running({ willRenew: false })).line).toBe(
      words.ends('November 30, 2026')
    )
    expect(subscriptionView(running({ expiresAt: null })).line).toBe(words.subscribed)
  })

  it('names a payment that did not go through, and any other state as subscribed', () => {
    expect(subscriptionView(running({ status: 'grace_period' })).line).toBe(
      words.status.grace_period
    )
    expect(subscriptionView(running({ status: 'something_new' })).line).toBe(words.subscribed)
  })

  it('sends the learner to the App Store for an App Store subscription, and to the website for a website one held too', () => {
    expect(subscriptionView(running({ managedIn: 'app_store' }))).toEqual({
      line: words.renews('November 30, 2026'),
      detail: words.appStore,
      action: null
    })
    expect(
      subscriptionView(running({ managedIn: 'app_store', willRenew: false }, {}))
    ).toMatchObject({ line: words.renews('November 30, 2026'), action: 'manage' })
  })
})
