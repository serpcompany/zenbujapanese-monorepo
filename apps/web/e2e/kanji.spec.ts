import type { Page } from '@playwright/test'
import { expect, needed, test, word } from './test'

const kanjiSearch = encodeURI('/dictionary/search/要/')
const kanaOnly = word(1577980)

const rows = [
  { on: 'the search page for 要', path: kanjiSearch, row: '要, kanji, pivot, shows kanji details' },
  { on: 'the word page', path: needed.path, row: '要, need, main point, shows kanji details' }
]

async function expectKanjiDetails(page: Page) {
  const main = page.getByRole('main')
  await expect(main.getByRole('button', { name: 'Show stroke order for 要' })).toBeVisible()
  await expect(main.getByRole('term')).toHaveText(['Strokes', 'Grade', 'JLPT'])
  await expect(main.getByRole('definition')).toHaveText(['9', '4', 'N2'])
  await expect(main.getByText('need, main point, essence, pivot, key to')).toBeVisible()
  for (const part of ['Readings', 'Elements', 'Words']) {
    await expect(main.getByRole('heading', { level: 3, name: part })).toBeVisible()
  }
}

test.describe('kanji details', () => {
  for (const { on, path, row } of rows) {
    test(`${on} opens 要 to its stroke order, metrics, meanings, readings, and words`, async ({
      page
    }) => {
      await page.goto(path)
      const kanji = page.getByRole('button', { name: row, exact: true })
      await expect(kanji).toHaveAttribute('aria-expanded', 'false')
      await expect(page.getByRole('button', { name: 'Show stroke order for 要' })).toBeHidden()
      await kanji.click()
      await expect(kanji).toHaveAttribute('aria-expanded', 'true')
      await expectKanjiDetails(page)
    })
  }

  test("opens a word from the kanji's readings", async ({ page }) => {
    await page.goto(kanjiSearch)
    await page.getByRole('button', { name: rows[0].row, exact: true }).click()
    await page.getByRole('main').getByRole('link', { name: needed.headword, exact: true }).click()
    await expect(page).toHaveURL(needed.path)
    await expect(page.getByRole('heading', { level: 1, name: needed.headword })).toBeVisible()
  })

  test("shows the kanji's stroke order", async ({ page }) => {
    await page.goto(kanjiSearch)
    await page.getByRole('button', { name: rows[0].row, exact: true }).click()
    await page.getByRole('button', { name: 'Show stroke order for 要' }).click()
    const strokeOrder = page.getByRole('dialog', { name: 'Stroke Order' })
    await expect(strokeOrder.getByRole('button', { name: 'Next stroke' })).toBeVisible()
  })

  for (const { on, path } of rows) {
    test(`${on} credits KanjiVG and Kanjium for the kanji details`, async ({ page }) => {
      await page.goto(path)
      for (const source of ['KanjiVG', 'Kanjium']) {
        await expect(page.getByRole('main').getByRole('link', { name: source })).toBeVisible()
      }
    })
  }

  for (const path of ['/dictionary/search/iru/', kanaOnly.path]) {
    test(`${decodeURI(path)}, without kanji details, credits neither`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole('main').getByRole('link', { name: 'JMdict' })).toBeVisible()
      for (const source of ['KanjiVG', 'Kanjium']) {
        await expect(page.getByRole('main').getByRole('link', { name: source })).toHaveCount(0)
      }
    })
  }
})
