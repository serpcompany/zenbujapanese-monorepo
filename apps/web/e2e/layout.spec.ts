import { openPageType } from './page-types'
import { expect, needed, sidewaysOverflow, test } from './test'

const pages = [
  '/',
  '/dictionary/',
  '/dictionary/search/iru/',
  encodeURI('/dictionary/search/要/'),
  needed.path,
  '/legal/privacy/',
  '/products/',
  '/products/zenbu-japanese-app/'
]

const opened = [
  {
    path: `${needed.path}#conjugations`,
    shown: 'its conjugations, the Past form, and 要',
    open: ['Past, 要った, いった', '要, need, main point, shows kanji details']
  },
  {
    path: encodeURI('/dictionary/search/要/'),
    shown: '要',
    open: ['要, kanji, pivot, shows kanji details']
  }
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

  for (const { path, shown, open } of opened) {
    test(`${decodeURI(path)} fits the window with ${shown} open`, async ({ page }) => {
      await openPageType(page, { name: shown, path, open })
      expect(await sidewaysOverflow(page), 'The page scrolls sideways').toBeLessThanOrEqual(0)
    })
  }
})
