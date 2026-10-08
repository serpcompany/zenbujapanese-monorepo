import type { Page } from '@playwright/test'
import { iphoneAppPage } from '../src/lib/products/zenbu-japanese-for-iphone'
import { expect, test } from './test'

const droppedClaims = [
  /no account/i,
  /need an account/i,
  /nothing to sign up for/i,
  /(stays?|stored) on (this|your|the) (iPhone|device)/i,
  /private by default/i,
  /open data/i
]

async function descriptions(page: Page) {
  return Promise.all(
    ['meta[name="description"]', 'meta[property="og:description"]'].map(
      async selector => (await page.locator(selector).getAttribute('content')) ?? ''
    )
  )
}

function expectNoDroppedClaim(texts: readonly string[]) {
  for (const text of texts) {
    for (const claim of droppedClaims) expect(text).not.toMatch(claim)
  }
}

test.describe('no account, local-only, or open-data claims', () => {
  for (const path of ['/', iphoneAppPage.path, '/about/']) {
    test(`${path} makes none`, async ({ page }) => {
      await page.goto(path)
      const main = page.getByRole('main')
      await expect(main.getByRole('heading', { level: 1 })).toBeVisible()
      expectNoDroppedClaim([(await main.textContent()) ?? '', ...(await descriptions(page))])
    })
  }
})
