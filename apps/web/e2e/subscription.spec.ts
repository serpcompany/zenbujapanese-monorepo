import type { Page } from '@playwright/test'
import { signedInService, standInForTheAccountService } from './account-stand-in'
import { expect, sidewaysOverflow, test } from './test'

const paidThrough = '2030-01-01T12:00:00.000Z'

type Store = 'app_store' | 'website'

const running = (managedIn: Store, status = 'active', willRenew = true) => ({
  source: managedIn === 'app_store' ? 'apple' : 'stripe',
  productId: managedIn === 'app_store' ? 'com.zenbujapanese.sync.monthly' : 'price_monthly',
  status,
  expiresAt: paidThrough,
  willRenew,
  managedIn
})

function subscription(held: ReturnType<typeof running>[], cloudAccess?: string) {
  const first = held[0]
  return {
    status: first?.status ?? 'none',
    active: held.length > 0,
    source: first?.source ?? null,
    productId: first?.productId ?? null,
    expiresAt: first?.expiresAt ?? null,
    willRenew: first?.willRenew ?? null,
    managedIn: first?.managedIn ?? null,
    running: held,
    canSubscribe: held.length === 0,
    cloudAccess: cloudAccess ?? (held.length > 0 ? 'subscribed' : 'subscription_required'),
    appAccountToken: '6f1c3c3e-0b5d-4c4e-9a51-7d0c2f1e8a01',
    offers: {
      appStore: ['com.zenbujapanese.sync.monthly'],
      website: ['price_monthly', 'price_yearly']
    }
  }
}

const plans = {
  plans: [
    {
      price: 'price_monthly',
      name: 'Zenbu Sync',
      amount: 499,
      currency: 'usd',
      interval: 'month',
      intervalCount: 1
    },
    {
      price: 'price_yearly',
      name: 'Zenbu Sync, yearly',
      amount: 4999,
      currency: 'usd',
      interval: 'year',
      intervalCount: 1
    }
  ],
  trialDays: null
}

const checkoutPage = 'https://checkout.stripe.com/c/pay/cs_test_stand_in'
const portalPage = 'https://billing.stripe.com/p/session/test_stand_in'

async function openAccount(
  page: Page,
  answers: Record<string, unknown>,
  { path = '/account/', heading = 'Subscription' } = {}
) {
  await standInForTheAccountService(page, Object.assign(answers, signedInService, { ...answers }))
  await page.route('https://*.stripe.com/**', route =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Stripe</h1>' })
  )
  await page.addInitScript(() => {
    const seen = window as unknown as { plansAtFirstPaint?: number; heightAtFirstPaint?: number }
    new MutationObserver((_, observer) => {
      const section = document.querySelector('section[aria-labelledby="subscription"]')
      if (!section) return
      seen.plansAtFirstPaint = section.querySelectorAll('button[aria-label]').length
      seen.heightAtFirstPaint = section.getBoundingClientRect().height
      observer.disconnect()
    }).observe(document, { childList: true, subtree: true })
  })
  await page.goto(path)
  const section = page.getByRole('region', { name: heading })
  await expect(section).toBeVisible()
  return section
}

test.describe('the subscription on the account page', () => {
  test('a learner who needs one sees the plans and goes to Stripe Checkout for one', async ({
    page
  }) => {
    const section = await openAccount(page, {
      'GET /v1/me/subscription': subscription([]),
      'GET /v1/me/subscription/plans': plans,
      'POST /v1/me/subscription/checkout': { url: checkoutPage }
    })
    await expect(section.getByText('$4.99 a month')).toBeVisible()
    await expect(section.getByText('$49.99 a year')).toBeVisible()
    await expect(section.getByText(/renews automatically until you cancel it/)).toBeVisible()
    const asked = page.waitForRequest('**/v1/me/subscription/checkout')
    await section.getByRole('button', { name: 'Subscribe to Zenbu Sync, $4.99 a month' }).click()
    expect((await asked).postDataJSON()).toMatchObject({ price: 'price_monthly' })
    await expect(page).toHaveURL(checkoutPage)
    expect(await sidewaysOverflow(page)).toBe(0)
  })

  test('the plans arrive with the section, so nothing on the page moves when they do', async ({
    page
  }) => {
    const section = await openAccount(page, {
      'GET /v1/me/subscription': subscription([]),
      'GET /v1/me/subscription/plans': { ...plans, trialDays: 7 }
    })
    await expect(section.getByText('Starts with a 7-day free trial').first()).toBeVisible()
    const first = await page.evaluate(() => {
      const seen = window as unknown as { plansAtFirstPaint?: number; heightAtFirstPaint?: number }
      return { plans: seen.plansAtFirstPaint, height: seen.heightAtFirstPaint }
    })
    expect(first.plans).toBe(2)
    expect(first.height).toBe((await section.boundingBox())?.height)
  })

  test('back from Checkout, the account page shows the subscription and drops ?subscribed from its address', async ({
    page
  }) => {
    const answers: Record<string, unknown> = {
      'GET /v1/me/subscription': subscription([]),
      'GET /v1/me/subscription/plans': plans
    }
    const section = await openAccount(page, answers)
    await page.route('**/v1/me/subscription/checkout', async route => {
      if (route.request().method() !== 'POST') return route.fallback()
      const { successUrl } = route.request().postDataJSON() as { successUrl: string }
      expect(successUrl).toMatch(/\/account\/\?subscribed=1$/)
      answers['GET /v1/me/subscription'] = subscription([running('website')])
      await page.route(checkoutPage, stripe =>
        stripe.fulfill({ status: 303, headers: { location: successUrl } })
      )
      await route.fulfill({
        status: 200,
        headers: {
          'access-control-allow-origin': (await route.request().headerValue('origin')) ?? '*',
          'access-control-allow-credentials': 'true'
        },
        json: { url: checkoutPage }
      })
    })
    await section.getByRole('button', { name: 'Subscribe to Zenbu Sync, $4.99 a month' }).click()
    const back = page.getByRole('region', { name: 'Subscription' })
    await expect(back.getByText('On zenbujapanese.com', { exact: true })).toBeVisible()
    await expect(page).toHaveURL(/\/account\/$/)
    await expect(back.getByRole('button', { name: /^Subscribe/ })).toHaveCount(0)
  })

  test('a website subscription opens the Customer Portal, and no plan is offered', async ({
    page
  }) => {
    const section = await openAccount(page, {
      'GET /v1/me/subscription': subscription([running('website')]),
      'POST /v1/me/subscription/portal': { url: portalPage }
    })
    await expect(section.getByText('On zenbujapanese.com', { exact: true })).toBeVisible()
    await expect(section.getByText('Renews on January 1, 2030.')).toBeVisible()
    await expect(section.getByRole('button', { name: /^Subscribe/ })).toHaveCount(0)
    await section.getByRole('button', { name: 'Manage your subscription' }).click()
    await expect(page).toHaveURL(portalPage)
  })

  test('an App Store subscription is managed in the App Store, with no portal', async ({
    page
  }) => {
    const section = await openAccount(page, {
      'GET /v1/me/subscription': subscription([running('app_store', 'active', false)])
    })
    await expect(section.getByText('In the App Store', { exact: true })).toBeVisible()
    await expect(section.getByText('Ends on January 1, 2030.')).toBeVisible()
    await expect(section.getByText(/managed in the App Store/)).toBeVisible()
    await expect(
      section.getByRole('link', { name: 'Open your App Store subscriptions' })
    ).toHaveAttribute('href', 'https://apps.apple.com/account/subscriptions')
    await expect(section.getByRole('button', { name: 'Manage your subscription' })).toHaveCount(0)
  })

  test('a learner paying in both stores sees both, and how to stop paying twice', async ({
    page
  }) => {
    const section = await openAccount(page, {
      'GET /v1/me/subscription': subscription([running('app_store'), running('website')])
    })
    await expect(section.getByText('In the App Store', { exact: true })).toBeVisible()
    await expect(section.getByText('On zenbujapanese.com', { exact: true })).toBeVisible()
    await expect(section.getByText(/paying for two subscriptions/)).toBeVisible()
    await expect(section.getByRole('button', { name: 'Manage your subscription' })).toBeVisible()
    expect(await sidewaysOverflow(page)).toBe(0)
  })

  test('the Japanese account page offers the plans in yen', async ({ page }) => {
    const section = await openAccount(
      page,
      {
        'GET /v1/me/subscription': subscription([]),
        'GET /v1/me/subscription/plans': {
          plans: [{ ...plans.plans[0], amount: 600, currency: 'jpy' }],
          trialDays: null
        }
      },
      { path: '/ja/account/', heading: 'サブスクリプション' }
    )
    await expect(section.getByText('月額￥600')).toBeVisible()
    await expect(
      section.getByRole('button', { name: 'Zenbu Sync、月額￥600に登録する' })
    ).toBeVisible()
    await expect(section.getByText(/解約するまで自動で更新され/)).toBeVisible()
  })
})
