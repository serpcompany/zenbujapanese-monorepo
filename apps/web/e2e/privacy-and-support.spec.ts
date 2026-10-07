import type { Page } from '@playwright/test'
import { expect, sidewaysOverflow, test } from './test'

const tomodachiSection = '/legal/privacy/#tomodachi'

const tomodachiHeading = (page: Page) =>
  page.getByRole('heading', { level: 2, name: 'Tomodachi for iPhone and Mac' })

test.describe('the privacy policy and support page, which Tomodachi links to', () => {
  test('the privacy policy has a section for Tomodachi for iPhone and Mac', async ({ page }) => {
    await page.goto(tomodachiSection)
    await expect(tomodachiHeading(page)).toBeInViewport()
    await expect(page.getByRole('main').getByText('"Data Not Collected"')).toBeVisible()
  })

  test('the support page says how to get help with Tomodachi', async ({ page }) => {
    await page.goto('/support/')
    const main = page.getByRole('main')
    await expect(main.getByText(/^For help with Tomodachi \(by Zenbu Japanese\)/)).toBeVisible()
    await main.getByRole('link', { name: 'How Tomodachi handles your information' }).click()
    await expect(page).toHaveURL(tomodachiSection)
    await expect(tomodachiHeading(page)).toBeInViewport()
  })

  for (const path of ['/legal/privacy/', '/support/']) {
    test(`${path} fits a 320-pixel phone`, async ({ page }) => {
      test.skip(test.info().project.name !== 'phone', 'Only a phone is this narrow')
      await page.setViewportSize({ width: 320, height: 640 })
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      expect(await sidewaysOverflow(page), 'The page scrolls sideways').toBeLessThanOrEqual(0)
    })
  }
})
