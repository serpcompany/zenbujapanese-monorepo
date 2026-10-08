import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { sitePages } from '../src/lib/pages'
import { signedOutService, standInForTheAccountService } from './account-stand-in'
import { accountPages, expect, needed, sourcesToggle, test } from './test'

const pages: { path: string; open?: string[] }[] = [
  ...sitePages.map(page => ({ path: page.path })),
  ...accountPages.map(page => ({ path: page.path })),
  { path: '/dictionary/search/iru/' },
  {
    path: encodeURI('/dictionary/search/要/'),
    open: ['要, kanji, pivot, shows kanji details']
  },
  {
    path: `${needed.path}#conjugations`,
    open: ['Past, 要った, いった', '要, need, main point, shows kanji details']
  },
  { path: '/dictionary/browse/' },
  { path: '/dictionary/browse/hiragana/' }
]

async function openEverything(page: Page, open: string[]) {
  for (const name of open) {
    const button = page.getByRole('button', { name, exact: true })
    await button.click()
    await expect(button).toHaveAttribute('aria-expanded', 'true')
  }
  if (await sourcesToggle(page).count()) await sourcesToggle(page).click()
  await expect(page.getByText('Loading examples')).toHaveCount(0)
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme })

    for (const { path, open = [] } of pages) {
      test(`${decodeURI(path)} has no text below its contrast minimum`, async ({ page }) => {
        await standInForTheAccountService(page, signedOutService)
        await page.goto(path)
        await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`))
        await openEverything(page, open)
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
        const { violations } = await new AxeBuilder({ page })
          .withRules(['color-contrast'])
          .analyze()
        const failures = violations.flatMap(violation =>
          violation.nodes.map(node => `${node.target.join(' ')}: ${node.failureSummary ?? ''}`)
        )
        expect(failures, 'Text below WCAG AA contrast').toEqual([])
      })
    }
  })
}
