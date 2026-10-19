import { afterEach, describe, expect, test, vi } from 'vitest'
import { answer, click, refusal, shows, unmount } from '@/test/account-page'
import { renderAccountView } from '@/test/account-view'
import { callTo, email, settings, signedIn } from '@/test/signed-in-account'

afterEach(unmount)

const monthly = {
  price: 'price_monthly',
  name: 'Zenbu Sync',
  amount: 499,
  currency: 'usd',
  interval: 'month',
  intervalCount: 1
}
const yearly = { ...monthly, price: 'price_yearly', amount: 4999, interval: 'year' }
const offers = {
  appStore: ['com.zenbujapanese.sync.monthly'],
  website: ['price_monthly', 'price_yearly']
}

const held = (managedIn: string, more: Record<string, unknown> = {}) => ({
  status: 'active',
  managedIn,
  expiresAt: '2026-11-19T12:00:00.000Z',
  willRenew: true,
  ...more
})

const subscription = (running: object[] = [], more: Record<string, unknown> = {}) => ({
  ...(running[0] ?? { status: 'none', managedIn: null, expiresAt: null, willRenew: null }),
  active: running.length > 0,
  running,
  canSubscribe: running.length === 0,
  cloudAccess: running.length > 0 ? 'subscribed' : 'subscription_required',
  appAccountToken: '6f1c3c3e-0b5d-4c4e-9a51-7d0c2f1e8a01',
  offers,
  ...more
})

const paidAfterReads = (reads: number) => ({
  'GET /v1/me/subscription': [
    ...Array.from({ length: reads }, () => answer(subscription())),
    answer(subscription([held('website')]))
  ],
  'GET /v1/me/subscription/plans': answer({ plans: [monthly], trialDays: null })
})

function leaving() {
  const assign = vi.fn()
  vi.stubGlobal('location', { ...window.location, origin: window.location.origin, assign })
  return assign
}

const accountPage = () => `${window.location.origin}/account/`

describe('the subscription on the account page', () => {
  test('offers each plan with its price and the trial, and opens Stripe Checkout to come back here', async () => {
    const assign = leaving()
    const { calls } = signedIn({
      more: {
        'GET /v1/me/subscription': answer(subscription()),
        'GET /v1/me/subscription/plans': answer({ plans: [monthly, yearly], trialDays: 7 }),
        'POST /v1/me/subscription/checkout': answer({
          url: 'https://checkout.stripe.com/c/pay/cs_1'
        })
      }
    })
    const page = renderAccountView()
    await shows(page, '$49.99 a year')
    expect(page.textContent).toContain('$4.99 a month')
    expect(page.textContent).toContain('Starts with a 7-day free trial')
    expect(page.textContent).toContain('Everything else in Zenbu stays free.')
    await click(page, 'Subscribe to Zenbu Sync, $4.99 a month')
    expect(callTo(calls, 'POST /v1/me/subscription/checkout')[0]).toMatchObject({
      credentials: 'omit',
      body: {
        price: 'price_monthly',
        successUrl: `${accountPage()}?subscribed=1`,
        cancelUrl: accountPage()
      }
    })
    expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_1')
  })

  test("shows a website subscription with when it renews, and opens Stripe's portal", async () => {
    const assign = leaving()
    const { calls } = signedIn({
      more: {
        'GET /v1/me/subscription': answer(subscription([held('website')])),
        'POST /v1/me/subscription/portal': answer({ url: 'https://billing.stripe.com/p/session/1' })
      }
    })
    const page = renderAccountView()
    await shows(page, 'On zenbujapanese.com')
    expect(page.textContent).toContain('Renews on November 19, 2026.')
    expect(page.textContent).not.toContain('Subscribe')
    expect(callTo(calls, 'GET /v1/me/subscription/plans')).toEqual([])
    await click(page, 'Manage your subscription')
    expect(callTo(calls, 'POST /v1/me/subscription/portal')[0]?.body).toEqual({
      returnUrl: accountPage()
    })
    expect(assign).toHaveBeenCalledWith('https://billing.stripe.com/p/session/1')
  })

  test('shows an App Store subscription as managed in the App Store, and offers no other', async () => {
    signedIn({
      more: {
        'GET /v1/me/subscription': answer(subscription([held('app_store', { willRenew: false })]))
      }
    })
    const page = renderAccountView()
    await shows(page, 'In the App Store')
    expect(page.textContent).toContain('Ends on November 19, 2026.')
    expect(page.textContent).toContain('it’s managed in the App Store')
    const link = [...page.querySelectorAll('a')].find(
      each => each.textContent === 'Open your App Store subscriptions'
    )
    expect(link?.getAttribute('href')).toBe('https://apps.apple.com/account/subscriptions')
    expect(page.textContent).not.toContain('Manage your subscription')
    expect(page.textContent).not.toContain('Subscribe')
  })

  test('shows both subscriptions of a learner paying in both stores, each managed where it was bought', async () => {
    signedIn({
      more: {
        'GET /v1/me/subscription': answer(
          subscription([held('app_store'), held('website', { status: 'grace_period' })])
        )
      }
    })
    const page = renderAccountView()
    await shows(page, 'You’re paying for two subscriptions')
    expect(page.textContent).toContain('In the App Store')
    expect(page.textContent).toContain('On zenbujapanese.com')
    expect(page.textContent).toContain('Update your payment method in Manage your subscription')
    expect(page.textContent).toContain('Manage your subscription')
    expect(page.textContent).toContain('Open your App Store subscriptions')
  })

  test('back from Checkout, reads the subscription again until it runs, or says Stripe is still confirming', async () => {
    signedIn({ more: paidAfterReads(2) })
    const page = renderAccountView(settings(), 'en', true)
    await shows(page, 'Renews on November 19, 2026.')
    expect(page.textContent).not.toContain('confirming your payment')
    unmount()

    signedIn({
      more: {
        'GET /v1/me/subscription': answer(subscription()),
        'GET /v1/me/subscription/plans': answer({ plans: [monthly], trialDays: null })
      }
    })
    const waiting = renderAccountView(settings(), 'en', true)
    await shows(waiting, 'Stripe hasn’t confirmed your payment yet')
  })

  test("says nothing changed when payments don't answer, or when the plan is gone", async () => {
    leaving()
    signedIn({
      more: {
        'GET /v1/me/subscription': answer(subscription()),
        'GET /v1/me/subscription/plans': answer({ plans: [monthly], trialDays: null }),
        'POST /v1/me/subscription/checkout': [
          refusal(503, 'billing_unavailable'),
          refusal(400, 'unknown_price')
        ]
      }
    })
    const page = renderAccountView()
    await shows(page, '$4.99 a month')
    await click(page, 'Subscribe to Zenbu Sync, $4.99 a month')
    await shows(page, 'Payments aren’t answering right now, so nothing changed.')
    await click(page, 'Subscribe to Zenbu Sync, $4.99 a month')
    await shows(page, 'That plan isn’t offered anymore.')
  })

  test('offers nothing while sync is free, as before the owner turns the gate on', async () => {
    const { calls } = signedIn({
      more: { 'GET /v1/me/subscription': answer(subscription([], { cloudAccess: 'free' })) }
    })
    const page = renderAccountView()
    await shows(page, `Signed in as ${email}`)
    expect(page.textContent).not.toContain('Subscription')
    expect(callTo(calls, 'GET /v1/me/subscription/plans')).toEqual([])
  })

  test('shows nothing where neither store sells it, and sends to the app where only the App Store does', async () => {
    signedIn({
      more: {
        'GET /v1/me/subscription': answer(
          subscription([], { offers: { appStore: [], website: [] } })
        )
      }
    })
    const page = renderAccountView()
    await shows(page, `Signed in as ${email}`)
    expect(page.textContent).not.toContain('Subscription')
    unmount()

    signedIn({
      more: {
        'GET /v1/me/subscription': answer(
          subscription([], {
            offers: { appStore: ['com.zenbujapanese.sync.monthly'], website: [] }
          })
        )
      }
    })
    const inTheApp = renderAccountView()
    await shows(inTheApp, 'Subscribe in the Zenbu Japanese app on your iPhone, iPad, or Mac.')
  })

  test('shows the plans in Japanese, with their prices in yen', async () => {
    signedIn({
      more: {
        'GET /v1/me/subscription': answer(subscription()),
        'GET /v1/me/subscription/plans': answer({
          plans: [{ ...monthly, amount: 600, currency: 'jpy' }],
          trialDays: null
        })
      }
    })
    const page = renderAccountView(settings(), 'ja')
    await shows(page, '月額￥600')
    expect(page.textContent).toContain('サブスクリプション')
  })
})

describe('each state of a subscription', () => {
  test.each([
    [
      'website',
      'billing_retry',
      'Your last payment didn’t go through',
      'in Manage your subscription to sync again'
    ],
    [
      'app_store',
      'billing_retry',
      'Your last payment didn’t go through',
      'in the App Store to sync again'
    ],
    [
      'app_store',
      'grace_period',
      'Active, but your last payment didn’t go through',
      'in the App Store to keep syncing'
    ],
    ['website', 'pending', 'Waiting for your payment', 'It starts once your payment arrives.'],
    ['app_store', 'paused', 'Paused', 'In the App Store']
  ])('shows a %s subscription in %s', async (store, status, title, detail) => {
    signedIn({
      more: {
        'GET /v1/me/subscription': answer(
          subscription([held(store, { status })], { canSubscribe: false })
        )
      }
    })
    const page = renderAccountView()
    await shows(page, title)
    expect(page.textContent).toContain(detail)
    expect(page.textContent).not.toContain('Subscribe')
  })

  test('shows the latest one, where it was bought, when none runs any more', async () => {
    for (const [status, says] of [
      ['expired', 'Ended'],
      ['revoked', 'Refunded or revoked']
    ]) {
      signedIn({
        more: {
          'GET /v1/me/subscription': answer(
            subscription([], {
              status,
              managedIn: 'website',
              cloudAccess: 'subscription_required'
            })
          ),
          'GET /v1/me/subscription/plans': answer({ plans: [monthly], trialDays: null })
        }
      })
      const page = renderAccountView()
      await shows(page, says)
      expect(page.textContent).toContain('On zenbujapanese.com')
      expect(page.textContent).not.toContain('Manage your subscription')
      unmount()
    }
  })

  test("says the plans can't be shown when Stripe doesn't answer, or none can be offered", async () => {
    signedIn({
      more: {
        'GET /v1/me/subscription': answer(subscription()),
        'GET /v1/me/subscription/plans': refusal(503, 'billing_unavailable')
      }
    })
    const failed = renderAccountView()
    await shows(failed, 'Payments aren’t answering right now')
    expect(failed.textContent).not.toContain('Subscribe')
    unmount()

    signedIn({
      more: {
        'GET /v1/me/subscription': answer(subscription()),
        'GET /v1/me/subscription/plans': answer({ plans: [], trialDays: null })
      }
    })
    const none = renderAccountView()
    await shows(none, 'The plans aren’t available right now.')
  })

  test('says why Subscribe started nothing: a running subscription, or a payment still confirming', async () => {
    leaving()
    signedIn({
      more: {
        'GET /v1/me/subscription': answer(subscription()),
        'GET /v1/me/subscription/plans': answer({ plans: [monthly], trialDays: null }),
        'POST /v1/me/subscription/checkout': [
          refusal(409, 'already_subscribed'),
          refusal(409, 'payment_confirming')
        ]
      }
    })
    const page = renderAccountView()
    await shows(page, '$4.99 a month')
    await click(page, 'Subscribe to Zenbu Sync, $4.99 a month')
    await shows(page, 'Your account already has a subscription.')
    await click(page, 'Subscribe to Zenbu Sync, $4.99 a month')
    await shows(page, 'Stripe is still confirming your last payment')
  })

  test('says when the portal has nothing to manage, and shows signed out when the session ends mid-click', async () => {
    signedIn({
      more: {
        'GET /v1/me/subscription': answer(subscription([held('website')])),
        'POST /v1/me/subscription/portal': refusal(404, 'no_subscription')
      }
    })
    const page = renderAccountView()
    await shows(page, 'On zenbujapanese.com')
    await click(page, 'Manage your subscription')
    await shows(page, 'This account hasn’t subscribed on this website.')
    unmount()

    signedIn({
      more: {
        'GET /v1/me/subscription': answer(subscription()),
        'GET /v1/me/subscription/plans': answer({ plans: [monthly], trialDays: null }),
        'POST /v1/me/subscription/checkout': refusal(401, 'unauthorized')
      }
    })
    const ended = renderAccountView()
    await shows(ended, '$4.99 a month')
    await click(ended, 'Subscribe to Zenbu Sync, $4.99 a month')
    await shows(ended, 'You’re not signed in.')
  })

  test('back from Checkout, offers nothing while it confirms, also when React runs its effects twice', async () => {
    signedIn({ more: paidAfterReads(2) })
    const page = renderAccountView(settings(), 'en', true, true)
    await shows(page, 'Renews on November 19, 2026.')
    expect(page.textContent).not.toContain('Subscribe to')
    unmount()

    signedIn({
      more: {
        'GET /v1/me/subscription': answer(subscription()),
        'GET /v1/me/subscription/plans': answer({ plans: [monthly], trialDays: null })
      }
    })
    const slow = renderAccountView(settings(), 'en', true)
    await shows(slow, 'a bank debit or konbini payment can take a few days')
    expect(slow.querySelector('button[aria-label^="Subscribe to"]')).toBeNull()
  })

  test("shows signed out when the session ends while it's confirming a payment", async () => {
    signedIn({
      more: {
        'GET /v1/me/subscription': [answer(subscription()), refusal(401, 'unauthorized')],
        'GET /v1/me/subscription/plans': answer({ plans: [monthly], trialDays: null })
      }
    })
    const page = renderAccountView(settings(), 'en', true)
    await shows(page, 'You’re not signed in.')
  })
})

describe('deleting an account with a subscription', () => {
  test("warns only about an App Store subscription that renews, and says so when it couldn't check", async () => {
    signedIn({
      more: {
        'GET /v1/me/subscription': answer(subscription([held('app_store', { willRenew: false })]))
      }
    })
    const ending = renderAccountView()
    await shows(ending, 'In the App Store')
    expect(ending.textContent).not.toContain('doesn’t cancel your App Store subscription')
    unmount()

    signedIn({ more: { 'GET /v1/me/subscription': refusal(503, 'internal') } })
    const unknown = renderAccountView()
    await shows(unknown, 'We couldn’t check your subscriptions just now.')
    expect(
      [...unknown.querySelectorAll('a')].some(
        each => each.textContent === 'Open your App Store subscriptions'
      )
    ).toBe(true)
  })

  test('warns from the subscription it read last, after Checkout', async () => {
    signedIn({ more: paidAfterReads(1) })
    const page = renderAccountView(settings(), 'en', true)
    await shows(page, 'cancels your zenbujapanese.com subscription at once')
  })

  test('says an App Store subscription keeps billing, before deleting and after', async () => {
    signedIn({
      more: {
        'GET /v1/me/subscription': answer(subscription([held('app_store')])),
        'DELETE /v1/me': answer({ status: 'deleted', appStoreSubscriptionContinues: true })
      }
    })
    const page = renderAccountView()
    await shows(page, 'Deleting your account doesn’t cancel your App Store subscription')
    await click(page, 'Delete account')
    await click(page, 'Delete my account')
    await shows(page, 'Your account is deleted.')
    expect(page.textContent).toContain('Your App Store subscription is still running')
  })

  test('says a website subscription is canceled with the account', async () => {
    signedIn({ more: { 'GET /v1/me/subscription': answer(subscription([held('website')])) } })
    const page = renderAccountView()
    await shows(page, 'cancels your zenbujapanese.com subscription at once, with no refund')
    expect(page.textContent).not.toContain('doesn’t cancel your App Store subscription')
  })
})
