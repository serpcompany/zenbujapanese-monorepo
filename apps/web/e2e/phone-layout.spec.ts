import type { Page } from '@playwright/test'
import { axeFailures } from './axe'
import { missingPage, openPageType, type PageType, pageTypes } from './page-types'
import { phoneLayoutProblems, phoneLimits } from './phone-checks'
import { expect, test } from './test'

const narrowestPhone = { width: 360, height: 800 }

test.skip(({ isMobile }) => !isMobile, 'These check the phone layout')
test.use({ viewport: narrowestPhone })

async function expectToFitAPhone(page: Page, view: string) {
  const problems = await phoneLayoutProblems(page)
  expect
    .soft(problems.smallText, `${view}: text smaller than ${phoneLimits.smallestText}px`)
    .toEqual([])
  expect.soft(problems.outsideTheViewport, `${view}: elements wider than the screen`).toEqual([])
  expect.soft(problems.clippedText, `${view}: text its box cuts off`).toEqual([])
  expect
    .soft(
      problems.narrowGridCells,
      `${view}: grid cells narrower than ${phoneLimits.narrowestGridCell}px`
    )
    .toEqual([])
  expect
    .soft(
      await axeFailures(page, 'target-size', { orUnclear: true }),
      `${view}: tap targets under 24px without the space around them (WCAG 2.2, 2.5.8)`
    )
    .toEqual([])
}

async function checkPageType(page: Page, pageType: PageType) {
  await openPageType(page, pageType)
  await expectToFitAPhone(page, pageType.name)
  for (const view of pageType.views ?? []) {
    await view.show(page)
    await expectToFitAPhone(page, `${pageType.name}, ${view.name}`)
  }
}

test.describe('phone layout', () => {
  for (const pageType of pageTypes) {
    test(`${pageType.name}, ${decodeURI(pageType.path)}, fits a ${narrowestPhone.width}px phone`, async ({
      page
    }) => {
      await checkPageType(page, pageType)
    })
  }

  test.describe('a missing page', () => {
    test.use({ allowedConsoleErrors: [/status of 404/] })

    test(`fits a ${narrowestPhone.width}px phone`, async ({ page }) => {
      await checkPageType(page, missingPage)
    })
  })
})
