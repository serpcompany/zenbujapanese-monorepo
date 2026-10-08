import type { Page } from '@playwright/test'
import { axeFailures } from './axe'
import { checkEachView, testEachPageType } from './page-types'
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

test.describe('phone layout', () => {
  testEachPageType(
    pageType =>
      `${pageType.name}, ${decodeURI(pageType.path)}, fits a ${narrowestPhone.width}px phone`,
    (page, pageType) => checkEachView(page, pageType, view => expectToFitAPhone(page, view))
  )
})
