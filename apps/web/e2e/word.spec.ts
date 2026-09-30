import type { Page } from '@playwright/test'
import { expect, needed, test } from './test'

const examples = (page: Page) =>
  page
    .getByRole('main')
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: 'Pronounce sentence' }) })

test.describe('word page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(needed.path)
  })

  test('shows the word, its breadcrumb, and its meaning', async ({ page }) => {
    await expect(page).toHaveTitle(
      `${needed.headword} (${needed.reading}) meaning | Zenbu Japanese`
    )
    await expect(page.getByRole('heading', { level: 1, name: needed.headword })).toBeVisible()
    const breadcrumb = page.getByRole('navigation', { name: 'breadcrumb' })
    await expect(breadcrumb.getByRole('link', { name: 'Dictionary' })).toHaveAttribute(
      'href',
      '/dictionary/'
    )
    await expect(page.getByRole('main')).toContainText('to be needed, to be necessary')
  })

  test('loads more examples when the list reaches its end, then has no more', async ({ page }) => {
    await expect(examples(page)).toHaveCount(25)
    await page.getByRole('button', { name: 'Load more examples' }).scrollIntoViewIfNeeded()
    await expect(examples(page)).toHaveCount(50)
    await expect(page.getByRole('button', { name: 'Load more examples' })).toHaveCount(0)
  })

  test("opens the conjugations sheet, a form's examples, and the table's page", async ({
    page
  }) => {
    await page.getByRole('button', { name: /shows conjugations$/ }).click()
    const sheet = page.getByRole('dialog', { name: 'Conjugations' })
    await expect(sheet.getByRole('tab', { name: 'Plain' })).toHaveAttribute('aria-selected', 'true')
    await expect(sheet.getByRole('button', { name: /^Past, 要った, いった$/ })).toBeVisible()

    await sheet.getByRole('tab', { name: 'Polite' }).click()
    await expect(sheet.getByRole('button', { name: /^Past, 要った, いった$/ })).toHaveCount(0)
    await sheet.getByRole('tab', { name: 'Plain' }).click()

    await sheet.getByRole('button', { name: /^Past, 要った, いった$/ }).click()
    const form = page.getByRole('dialog', { name: 'Past' })
    await expect(form.getByRole('heading', { name: 'Examples' })).toBeVisible()
    await expect(form.getByRole('listitem').first()).toBeVisible()
    await form.getByRole('button', { name: 'Back to conjugations' }).click()

    await page
      .getByRole('dialog', { name: 'Conjugations' })
      .getByRole('link', { name: 'Open the conjugation table’s page' })
      .click()
    await expect(page).toHaveURL(`${needed.path}conjugations/`)
  })

  test('opens Frequency Details from a frequency row', async ({ page }) => {
    await page.getByRole('button', { name: 'JLPT level N5' }).click()
    const details = page.getByRole('dialog', { name: 'Frequency Details' })
    await expect(details.getByRole('heading', { name: 'JLPT Levels' })).toBeVisible()
    await details.getByRole('button', { name: 'Done' }).click()
    await expect(details).toHaveCount(0)
  })

  test("opens the More actions menu with the app's actions", async ({ page }) => {
    await page.getByRole('button', { name: 'More actions' }).click()
    const menu = page.getByRole('menu', { name: 'More actions' })
    for (const item of ['Mark as Known', 'Add to List…', 'Open in App', 'Copy Link']) {
      await expect(menu.getByRole('menuitem', { name: item })).toBeVisible()
    }
    await menu.getByRole('menuitem', { name: 'Add to List…' }).click()
    const prompt = page.getByRole('dialog', { name: 'Add to List works in the app' })
    await expect(prompt.getByRole('button', { name: 'Get the app' })).toBeVisible()
  })

  test('copies the link from the More actions menu', async ({ page, context, baseURL }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: 'Copy Link' }).click()
    await expect(page.getByText('Link copied')).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      new URL(needed.path, baseURL).href
    )
  })

  test('opens a kanji from the Kanji section', async ({ page }) => {
    await page.getByRole('link', { name: /^要 need, main point/ }).click()
    await expect(page).toHaveURL(encodeURI('/dictionary/kanji/要/'))
    await expect(page.getByRole('heading', { level: 1, name: '要' })).toBeVisible()
  })
})
