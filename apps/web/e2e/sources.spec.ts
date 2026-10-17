import { creditsShownBy } from '@zenbu/dictionary-core/sources/credits'
import { expect, test } from './test'

const { conversionNotice, credits } = creditsShownBy('website')

test.describe('the Sources page', () => {
  test('lists every source the core credits the website with, each with its credit, licence, and project link', async ({
    page
  }) => {
    await page.goto('/sources/')
    const main = page.getByRole('main')
    await expect(main.getByRole('heading', { level: 1, name: 'Sources' })).toBeVisible()
    const listed = main.getByRole('listitem')
    await expect(listed).toHaveCount(credits.length)
    for (const [place, credit] of credits.entries()) {
      const item = listed.nth(place)
      await expect(item.getByRole('link', { name: credit.name, exact: true })).toHaveAttribute(
        'href',
        credit.url
      )
      await expect(item).toContainText(credit.credit)
      await expect(item).toContainText(credit.license.name)
    }
  })

  test('says Zenbu converts each source, and that Jiten’s lists are modified and shared alike', async ({
    page
  }) => {
    await page.goto('/sources/')
    const main = page.getByRole('main')
    await expect(main).toContainText(conversionNotice)
    const jiten = main.getByRole('listitem').filter({ hasText: 'jiten.moe' })
    await expect(jiten).toContainText('modified.')
    await expect(jiten).toContainText('adapted from its data')
    await expect(jiten).toContainText('shared under the same licence, CC BY-SA 4.0')
  })

  test('credits the text analysis the dictionary runs on, and links the EDRDG licence', async ({
    page
  }) => {
    await page.goto('/sources/')
    const main = page.getByRole('main')
    for (const name of ['Sudachi', 'Kuromoji']) {
      await expect(main.getByRole('link', { name, exact: true })).toBeVisible()
    }
    await expect(
      main.getByRole('link', { name: 'EDRDG licence, CC BY-SA 4.0', exact: true }).first()
    ).toHaveAttribute('href', 'https://www.edrdg.org/edrdg/licence.html')
    await expect(main).not.toContainText('DaKanji')
  })
})
