import type { Page } from '@playwright/test'
import { axeFailures } from './axe'
import { checkEachView, testEachPageType } from './page-types'
import { expect, onPhone, sourcesToggle, test } from './test'

async function openSources(page: Page) {
  if (await sourcesToggle(page).count()) await sourcesToggle(page).click()
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme })

    testEachPageType(
      pageType => `${decodeURI(pageType.path)} has no text below its contrast minimum`,
      async (page, pageType) => {
        await checkEachView(
          page,
          pageType,
          async view => {
            await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`))
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
            expect(
              await axeFailures(page, 'color-contrast'),
              `${view}: text below WCAG AA contrast`
            ).toEqual([])
          },
          { views: view => onPhone() && view.overlay === true, prepare: openSources }
        )
      }
    )
  })
}
