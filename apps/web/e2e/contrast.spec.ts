import { axeFailures } from './axe'
import { openPageType, pageTypes } from './page-types'
import { expect, test } from './test'

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme })

    for (const pageType of pageTypes) {
      test(`${decodeURI(pageType.path)} has no text below its contrast minimum`, async ({
        page
      }) => {
        await openPageType(page, pageType)
        await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`))
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
        expect(await axeFailures(page, 'color-contrast'), 'Text below WCAG AA contrast').toEqual([])
      })
    }
  })
}
