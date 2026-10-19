import type { Page } from '@playwright/test'
import type { Locale } from '../src/lib/i18n/config'
import { coreText } from '../src/lib/i18n/core-text'
import { getDictionary } from '../src/lib/i18n/dictionary'
import { fill } from '../src/lib/i18n/format'
import { localizedPath } from '../src/lib/i18n/paths'
import { linesOfText } from './phone-checks'
import { expect, needed, sourcesToggle, test, word } from './test'

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
  await expect(main.getByRole('definition')).toHaveText(['9', '4', 'N3'])
  await expect(
    main.getByRole('link', { name: 'JLPT kanji lists', includeHidden: true })
  ).toBeAttached()
  await expect(main.getByText('need, main point, essence, pivot, key to')).toBeVisible()
  for (const part of ['Readings', 'Elements', 'Lists', 'Notes', 'Words']) {
    await expect(main.getByRole('heading', { level: 3, name: part })).toBeVisible()
  }
}

async function openKanji(page: Page, { path, row }: (typeof rows)[number]) {
  await page.goto(path)
  await page.getByRole('button', { name: row, exact: true }).click()
}

async function stepThroughStrokes(page: Page, locale: Locale, row: string) {
  const say = (text: string) => coreText(text, locale)
  const shaped = (sample: string, digit: string, whole: boolean) =>
    new RegExp(`^${say(sample).replace(digit, '\\d')}${whole ? '$' : ''}`)
  await page.clock.install()
  await page.goto(localizedPath(kanjiSearch, locale))
  await page.getByRole('button', { name: row, exact: true }).click()
  const show = page.getByRole('button', { name: say('Show stroke order for 要') })
  await show.click()
  const strokeOrder = page.getByRole('dialog', { name: say('Stroke Order') })
  const position = strokeOrder.getByText(shaped('Stroke 1 of 9', '1', true))
  const drawn = strokeOrder.getByText(shaped('0 strokes complete', '0', false))
  const button = (name: string) => strokeOrder.getByRole('button', { name: say(name) })
  await expect(position).toHaveText(say('Stroke 1 of 9'))

  await button('Next stroke').click()
  await page.clock.runFor(2_000)
  await expect(drawn).toHaveText(say('1 strokes complete'))
  await expect(position).toHaveText(say('Stroke 2 of 9'))
  await button('Previous stroke').click()
  await expect(drawn).toHaveText(say('0 strokes complete'))
  await expect(button('Previous stroke')).toBeDisabled()

  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000))
  await button('Play stroke order').click()
  await button('Pause stroke order').click()
  await page.clock.runFor(10_000)
  await expect(drawn).toHaveText(say('0 strokes complete'))
  await button('Play stroke order').click()
  await page.clock.runFor(10_000)
  await expect(drawn).toHaveText(say('9 strokes complete'))
  await expect(button('Next stroke')).toBeDisabled()
  await expect(button('Play stroke order')).toBeVisible()

  await page.clock.resume()
  await page.keyboard.press('Escape')
  await expect(strokeOrder).toHaveCount(0)
  await show.click()
  await expect(drawn).toHaveText(say('0 strokes complete'))
  await expect(position).toHaveText(say('Stroke 1 of 9'))
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

  test('steps, plays, and pauses the strokes, from the first each time it opens', async ({
    page
  }) => {
    await stepThroughStrokes(page, 'en', rows[0].row)
  })

  test('on a Japanese page, steps, plays, and pauses the strokes in Japanese', async ({ page }) => {
    const row = fill(getDictionary('ja').search.kanjiRowLabel, {
      character: '要',
      summary: 'pivot'
    })
    await stepThroughStrokes(page, 'ja', row)
  })

  for (const { on, path } of rows) {
    test(`${on} credits KanjiVG and Kanjium for the kanji details`, async ({ page }) => {
      await page.goto(path)
      const kanjiVG = page
        .getByRole('main')
        .getByRole('link', { name: 'KanjiVG', includeHidden: true })
      await expect(kanjiVG).toBeAttached()
      await expect(kanjiVG).toBeHidden()
      await sourcesToggle(page).click()
      for (const source of ['KanjiVG', 'Kanjium']) {
        await expect(page.getByRole('main').getByRole('link', { name: source })).toBeVisible()
      }
    })
  }

  for (const path of ['/dictionary/search/iru/', kanaOnly.path]) {
    test(`${decodeURI(path)}, without kanji details, credits neither`, async ({ page }) => {
      await page.goto(path)
      await sourcesToggle(page).click()
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

  test("on a phone, each of 要's words keeps its headword on one line", async ({
    page
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'A phone-width layout')
    await page.setViewportSize({ width: 360, height: 800 })
    await openKanji(page, rows[0])
    const words = page
      .locator('[data-kanji-details="要"] section', {
        has: page.getByRole('heading', { level: 3, name: 'Words' })
      })
      .getByRole('listitem')
    await expect(words.first()).toBeVisible()
    const headwords = await linesOfText(words.locator('[lang="ja"]'))
    expect(headwords.length).toBeGreaterThan(10)
    expect(headwords).toEqual(headwords.map(({ text }) => ({ text, oneLine: true })))
  })

  test("Lists and Notes open the get-the-app prompt, as a word page's do", async ({ page }) => {
    await openKanji(page, rows[0])
    const details = page.locator('[data-kanji-details="要"]')
    await details.getByRole('button', { name: 'Add to List' }).click()
    const prompt = page.getByRole('dialog', { name: 'Add to List works in the app' })
    await expect(prompt.getByRole('button', { name: 'Get the app' })).toBeVisible()
  })
})
