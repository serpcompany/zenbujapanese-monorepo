import type { Page } from '@playwright/test'
import { accountPages, expect, footerAccountLink, onClosedProduction, test } from './test'

const anyAccountPage = accountPages.map(({ path }) => `a[href^="${path}"]`).join(', ')

const accountServices = [
  'https://api.zenbujapanese.com',
  'https://api-staging.zenbujapanese.com',
  'http://localhost:8789'
]

test.skip(
  !onClosedProduction,
  "Runs on the site built and served with production's settings: E2E_SITE_ENV=production (docs/agents/web.md, Account pages)"
)

async function requestsToTheAccountService(page: Page, baseURL: string | undefined) {
  const site = new URL(baseURL ?? 'http://localhost').origin
  const requests: string[] = []
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (accountServices.includes(url.origin) || /^\/v1\/(auth|me)(\/|$)/.test(url.pathname)) {
      requests.push(url.href)
    }
    return url.origin === site ? route.continue() : route.fulfill({ status: 204 })
  })
  return requests
}

test.describe("production's account pages, while its ACCOUNT_API_URL is empty", () => {
  for (const { path, title } of accountPages) {
    test(`${path} says signing in isn't available, links no account page, and stays noindex`, async ({
      page,
      baseURL
    }) => {
      const requests = await requestsToTheAccountService(page, baseURL)
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
      await expect(page.getByRole('main')).toContainText(
        'Signing in to a Zenbu account isn’t available on this site yet.'
      )
      await expect(page.getByRole('button', { name: 'Email me a code' })).toHaveCount(0)
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        'content',
        'noindex, nofollow'
      )
      await expect(page.locator(anyAccountPage)).toHaveCount(0)
      await page.waitForLoadState('networkidle')
      expect(requests).toEqual([])
    })
  }

  test('a page built ahead of time has no Sign in in its footer', async ({ page, baseURL }) => {
    const requests = await requestsToTheAccountService(page, baseURL)
    await page.goto('/about/')
    await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Sitemap' })).toBeVisible()
    await expect(footerAccountLink(page)).toHaveCount(0)
    await expect(page.locator(anyAccountPage)).toHaveCount(0)
    await page.waitForLoadState('networkidle')
    expect(requests).toEqual([])
  })
})
