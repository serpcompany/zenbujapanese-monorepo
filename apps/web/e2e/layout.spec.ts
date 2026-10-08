import { toolPages } from '../src/lib/tools/converters'
import { openPageType, pageTypes } from './page-types'
import { expect, needed, sidewaysOverflow, test } from './test'

const pages = [
  '/',
  '/dictionary/',
  '/dictionary/search/iru/',
  encodeURI('/dictionary/search/要/'),
  needed.path,
  '/legal/privacy/',
  '/products/',
  '/products/zenbu-japanese-app/',
  ...toolPages.map(page => page.path)
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
      await expect(
        page.getByRole('contentinfo').getByRole('link', { name: 'Privacy Policy' })
      ).toBeVisible()
      expect(await sidewaysOverflow(page), 'The page scrolls sideways').toBeLessThanOrEqual(0)
    })
  }

  for (const pageType of pageTypes.filter(({ open }) => open?.length)) {
    test(`${pageType.name}, ${decodeURI(pageType.path)}, fits the window with its sections open`, async ({
      page
    }) => {
      await openPageType(page, pageType)
      expect(await sidewaysOverflow(page), 'The page scrolls sideways').toBeLessThanOrEqual(0)
    })
  }
})
