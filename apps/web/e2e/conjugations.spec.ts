import type { Locator, Page } from '@playwright/test'
import { expect, needed, test, word } from './test'

const noConjugations = word(1609600)

const section = (page: Page) =>
  page
    .getByRole('heading', { level: 2, name: 'Conjugations' })
    .getByRole('button', { name: 'Conjugations' })

const form = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

async function panelOf(button: Locator) {
  const id = await button.getAttribute('aria-controls')
  return button.page().locator(`[id="${id}"]`)
}

test.describe('conjugations section', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${needed.path}#conjugations`)
    await expect(section(page)).toHaveAttribute('aria-expanded', 'true')
  })

  test('opens from #conjugations on the Plain forms, and closes from its heading', async ({
    page
  }) => {
    await expect(page.getByRole('tab', { name: 'Plain' })).toHaveAttribute('aria-selected', 'true')
    await expect(form(page, 'Past, 要った, いった')).toBeVisible()
    await section(page).click()
    await expect(section(page)).toHaveAttribute('aria-expanded', 'false')
    await expect(form(page, 'Past, 要った, いった')).toBeHidden()
  })

  test('the Polite tab shows the Polite forms in place of the Plain ones', async ({ page }) => {
    const tabs = page.getByRole('tablist', { name: 'Conjugation mode' })
    await tabs.getByRole('tab', { name: 'Polite' }).click()
    await expect(tabs.getByRole('tab', { name: 'Polite' })).toHaveAttribute('aria-selected', 'true')
    await expect(form(page, 'Past, 要りました, いりました')).toBeVisible()
    await expect(form(page, 'Past, 要った, いった')).toBeHidden()
  })

  test('a form opens to its explanation, its pronounced form, and its examples', async ({
    page
  }) => {
    const past = form(page, 'Past, 要った, いった')
    await expect(past).toHaveAttribute('aria-expanded', 'false')
    await past.click()
    await expect(past).toHaveAttribute('aria-expanded', 'true')
    const opened = await panelOf(past)
    await expect(opened.getByText('Describes an action or state in the past.')).toBeVisible()
    await expect(opened.getByRole('button', { name: 'Pronounce いった' })).toBeVisible()
    await expect(opened.getByRole('heading', { name: 'Examples' })).toBeVisible()
    await expect(
      opened
        .getByRole('listitem')
        .filter({ has: page.getByRole('button', { name: 'Pronounce sentence' }) })
        .first()
    ).toBeVisible()
  })

  test('a form without examples says so', async ({ page }) => {
    await page.getByRole('tab', { name: 'Polite' }).click()
    const past = form(page, 'Past, 要りました, いりました')
    await past.click()
    await expect(
      (await panelOf(past)).getByText('No example sentences use this form yet.')
    ).toBeVisible()
  })
})

test('a word without conjugations has no Conjugations section', async ({ page }) => {
  await page.goto(noConjugations.path)
  await expect(page.getByRole('heading', { level: 1, name: noConjugations.headword })).toBeVisible()
  await expect(page.getByRole('link', { name: /shows conjugations$/ })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Conjugations' })).toHaveCount(0)
})
