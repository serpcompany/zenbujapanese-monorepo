import { expect, needed, test } from './test'

const pages = [
  '/',
  '/dictionary/',
  '/dictionary/search/iru/',
  needed.path,
  `${needed.path}conjugations/`,
  `${needed.path}conjugations/plain/past/`,
  encodeURI('/dictionary/kanji/要/'),
  '/legal/privacy/'
]

test.describe('layout', () => {
  for (const path of pages) {
    test(`${decodeURI(path)} fits the window, with the site's header and footer`, async ({
      page
    }) => {
      await page.goto(path)
      await expect(
        page.getByRole('banner').getByRole('link', { name: 'Zenbu Japanese' })
      ).toBeVisible()
      await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Legal' })).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
      expect(overflow, 'The page scrolls sideways').toBeLessThanOrEqual(0)
    })
  }
})
