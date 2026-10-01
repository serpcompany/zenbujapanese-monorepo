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
  for (const part of ['Readings', 'Elements', 'Lists', 'Notes', 'Words']) {
    await expect(main.getByRole('heading', { level: 3, name: part })).toBeVisible()
  }
}

async function openKanji(page: Page, { path, row }: (typeof rows)[number]) {
  await page.goto(path)
  await page.getByRole('button', { name: row, exact: true }).click()
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

  test("a reading row opens its first word, named as the app's row is", async ({ page }) => {
    await page.goto(kanjiSearch)
    await page.getByRole('button', { name: rows[0].row, exact: true }).click()
    const main = page.getByRole('main')
    await expect(main.getByRole('link', { name: /^Name reading とし/ })).toHaveCount(0)
    const reading = new RegExp(`^Kun reading い\\.る, ${needed.headword}, `)
    await main.getByRole('link', { name: reading }).click()
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

  for (const kanji of rows) {
    test(`${kanji.on}: 要's More actions offer the app's actions`, async ({ page }) => {
      await openKanji(page, kanji)
      await page.getByRole('button', { name: 'More actions for 要' }).click()
      const menu = page.getByRole('menu', { name: 'More actions for 要' })
      for (const item of [
        'Mark as Known',
        'Add to List…',
        'Add Note',
        'Open in App',
        'Copy Link'
      ]) {
        await expect(menu.getByRole('menuitem', { name: item })).toBeVisible()
      }
      await menu.getByRole('menuitem', { name: 'Add Note' }).click()
      const prompt = page.getByRole('dialog', { name: 'Add Note works in the app' })
      await expect(prompt.getByRole('button', { name: 'Get the app' })).toBeVisible()
    })
  }

  test("Copy Link copies 要's search page, from the word page too", async ({
    page,
    context,
    baseURL
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await openKanji(page, rows[1])
    await page.getByRole('button', { name: 'More actions for 要' }).click()
    await page.getByRole('menuitem', { name: 'Copy Link' }).click()
    await expect(page.getByText('Link copied')).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      new URL(kanjiSearch, baseURL).href
    )
  })

  test("Lists and Notes open the get-the-app prompt, as a word page's do", async ({ page }) => {
    await openKanji(page, rows[0])
    const details = page.locator('[data-kanji-details="要"]')
    await details.getByRole('button', { name: 'Add to List' }).click()
    const prompt = page.getByRole('dialog', { name: 'Add to List works in the app' })
    await expect(prompt.getByRole('button', { name: 'Get the app' })).toBeVisible()
  })
})
