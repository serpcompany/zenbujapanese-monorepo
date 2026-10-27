import type { Locator, Page } from '@playwright/test'
import type { Locale } from '../src/lib/i18n/config'
import { getDictionary } from '../src/lib/i18n/dictionary'
import { type ReadingAid, readingAidStorageKey, readingAids } from '../src/lib/reading-aids'
import {
  accountButton,
  accountMenu,
  expect,
  menuButton,
  needed,
  onPhone,
  phoneMenu,
  test,
  word
} from './test'

const text = (locale: Locale = 'en') => getDictionary(locale).chrome.readingAids
const aid = (scope: Page | Locator, name: string) => scope.locator(`[data-aid="${name}"]`)
const headline = (page: Page) => page.getByRole('heading', { level: 1 }).locator('..')
const kanjiSearch = encodeURI('/dictionary/search/要/')
const kanjiRow = '要, kanji, need, main point, essence, pivot, key to, shows kanji details'
const firstExample = "I don't need money at present."

async function readingAidsMenu(page: Page, locale: Locale = 'en') {
  if (onPhone()) {
    await menuButton(page).click()
    await phoneMenu(page)
      .getByRole('button', { name: text(locale).label })
      .click()
    return page.getByRole('menu', { name: text(locale).label })
  }
  await accountButton(page).click()
  return accountMenu(page)
}

async function turn(page: Page, id: ReadingAid, shown: boolean, locale: Locale = 'en') {
  const menu = await readingAidsMenu(page, locale)
  const item = menu.getByRole('menuitemcheckbox', { name: text(locale)[id] })
  await expect(item).toHaveAttribute('aria-checked', String(!shown))
  await item.click()
  await expect(item).toHaveAttribute('aria-checked', String(shown))
  await page.keyboard.press('Escape')
  if (onPhone()) await page.keyboard.press('Escape')
  await expect(phoneMenu(page)).toBeHidden()
}

const kept = (settings: Partial<Record<ReadingAid, boolean>>) =>
  Object.fromEntries(
    Object.entries(settings).map(([id, shown]) => [
      readingAidStorageKey(id as ReadingAid),
      String(shown)
    ])
  )

async function keep(page: Page, settings: Partial<Record<ReadingAid, boolean>>) {
  await page.addInitScript(values => {
    for (const [key, value] of Object.entries(values)) window.localStorage.setItem(key, value)
  }, kept(settings))
}

async function openKanjiDetails(page: Page) {
  await page.goto(kanjiSearch)
  const row = page.getByRole('button', { name: kanjiRow })
  await expect(async () => {
    if ((await row.getAttribute('aria-expanded')) !== 'true') await row.click()
    await expect(row).toHaveAttribute('aria-expanded', 'true', { timeout: 1_000 })
  }).toPass()
  return page.locator('[data-kanji-details="要"]')
}

test.describe('Reading Aids', () => {
  test('are the app’s by default: furigana and translations, no romaji or word meanings', async ({
    page
  }) => {
    await page.goto(needed.path)
    const heading = page.getByRole('heading', { level: 1 })
    await expect(heading.locator('rt')).toBeVisible()
    await expect(aid(headline(page), 'reading')).toBeHidden()
    await expect(aid(page, 'romaji').first()).toBeHidden()
    await expect(aid(page, 'meaning').first()).toBeHidden()
    await expect(page.getByText(firstExample).first()).toBeVisible()
    const menu = await readingAidsMenu(page)
    await expect(menu.getByRole('menuitemcheckbox')).toHaveText(
      readingAids.map(({ id }) => text()[id])
    )
    for (const { id, shownByDefault } of readingAids) {
      await expect(menu.getByRole('menuitemcheckbox', { name: text()[id] })).toHaveAttribute(
        'aria-checked',
        String(shownByDefault)
      )
    }
  })

  test('Furigana off leaves the word page’s headword plain, with its reading under it', async ({
    page
  }) => {
    await page.goto(needed.path)
    await turn(page, 'furigana', false)
    const heading = page.getByRole('heading', { level: 1 })
    await expect(heading.locator('rt')).toBeHidden()
    await expect(aid(headline(page), 'reading')).toHaveText(needed.reading)
    await expect(aid(headline(page), 'reading')).toBeVisible()
    await expect(page.getByRole('main').locator('rt:visible')).toHaveCount(0)
  })

  test('Furigana off leaves the search results and a kanji’s words plain', async ({ page }) => {
    await page.goto('/dictionary/search/iru/')
    const rows = page.locator('[data-result-row]')
    await expect(rows.locator('rt').first()).toBeVisible()
    await turn(page, 'furigana', false)
    await expect(rows.locator('rt:visible')).toHaveCount(0)
    const details = await openKanjiDetails(page)
    await expect(details.locator('rt:visible')).toHaveCount(0)
  })

  test('Romaji shows under the headword, each example, the results, and a kanji’s readings', async ({
    page
  }) => {
    await page.goto(needed.path)
    await turn(page, 'romaji', true)
    await expect(aid(headline(page), 'romaji')).toHaveText('iru')
    await expect(page.getByText('ima no tokoro okane ha iranai。').first()).toBeVisible()
    await page.goto(`${needed.path}#conjugations`)
    const past = page.getByRole('button', { name: 'Past, 要った, いった' })
    await expect(async () => {
      if ((await past.getAttribute('aria-expanded')) !== 'true') await past.click()
      await expect(past).toHaveAttribute('aria-expanded', 'true', { timeout: 1_000 })
    }).toPass()
    const formRomaji = page.getByText('itta', { exact: true }).filter({ visible: true })
    await expect(formRomaji).not.toHaveCount(0)
    await page.goto('/dictionary/search/iru/')
    const row = page.locator(`[data-result-row="1546640"]`)
    await expect(aid(row, 'romaji')).toHaveText('iru')
    await expect(aid(row, 'romaji')).toBeVisible()
    const details = await openKanjiDetails(page)
    await expect(aid(details.locator('[data-kanji-reading="on.ヨウ"]'), 'romaji')).toHaveText('you')
    await expect(aid(details.locator('[data-kanji-reading="kun.い.る"]'), 'romaji')).toBeVisible()
  })

  test('Word Meanings shows a short meaning under each word of the word page’s examples', async ({
    page
  }) => {
    await page.goto(needed.path)
    const meaning = page.getByText('be needed', { exact: true }).first()
    await expect(meaning).toBeHidden()
    await turn(page, 'wordMeanings', true)
    await expect(meaning).toBeVisible()
    await expect(page.getByText('money', { exact: true }).first()).toBeVisible()
    const word = page.getByRole('link', { name: /^いらない/ }).first()
    const [wordBox, meaningBox] = await Promise.all([word.boundingBox(), meaning.boundingBox()])
    expect(meaningBox?.y).toBeGreaterThan((wordBox?.y ?? 0) + (wordBox?.height ?? 0) / 2)
  })

  test('Sentence Translations off hides each example’s English', async ({ page }) => {
    await page.goto(needed.path)
    await expect(page.getByText(firstExample).first()).toBeVisible()
    await turn(page, 'translations', false)
    await expect(page.getByText(firstExample).filter({ visible: true })).toHaveCount(0)
    await expect(aid(page, 'translation').filter({ visible: true })).toHaveCount(0)
  })

  test('a setting survives a reload and holds on the next page', async ({ page }) => {
    await page.goto(needed.path)
    await turn(page, 'romaji', true)
    await turn(page, 'furigana', false)
    await page.reload()
    await expect(aid(page, 'romaji').first()).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 }).locator('rt')).toBeHidden()
    await page.goto(word(1546750).path)
    await expect(aid(page, 'romaji').first()).toBeVisible()
    const menu = await readingAidsMenu(page)
    await expect(menu.getByRole('menuitemcheckbox', { name: text().romaji })).toHaveAttribute(
      'aria-checked',
      'true'
    )
  })

  test('a change in another tab shows in this one, with its menus closed', async ({ page }) => {
    await page.goto(needed.path)
    const other = await page.context().newPage()
    await other.goto('/dictionary/search/iru/')
    await turn(other, 'romaji', true)
    await expect(aid(headline(page), 'romaji')).toBeVisible()
    const menu = await readingAidsMenu(page)
    await expect(menu.getByRole('menuitemcheckbox', { name: text().romaji })).toHaveAttribute(
      'aria-checked',
      'true'
    )
  })

  test('the Japanese pages name the settings in Japanese', async ({ page }) => {
    await page.goto(`/ja${needed.path}`)
    await turn(page, 'romaji', true, 'ja')
    await expect(aid(page, 'romaji').first()).toBeVisible()
  })
})

const layoutShift = (page: Page) =>
  page.evaluate(() => (window as unknown as { shifted: number }).shifted)

async function watchLayoutShifts(page: Page) {
  await page.addInitScript(() => {
    const watched = window as unknown as { shifted: number }
    watched.shifted = 0
    new PerformanceObserver(list => {
      for (const entry of list.getEntries() as (PerformanceEntry & {
        value: number
        hadRecentInput: boolean
      })[]) {
        if (!entry.hadRecentInput) watched.shifted += entry.value
      }
    }).observe({ type: 'layout-shift', buffered: true })
  })
}

const flipped = { furigana: false, romaji: true, wordMeanings: true, translations: false }

test.describe('saved Reading Aids', () => {
  for (const [name, settings] of [
    ['the defaults', {}],
    ['every one flipped', flipped]
  ] as const) {
    test(`with ${name}, no page moves as it loads or as a link opens the next`, async ({
      page
    }) => {
      await keep(page, settings)
      await watchLayoutShifts(page)
      for (const path of [needed.path, '/dictionary/search/iru/', kanjiSearch]) {
        await page.goto(path)
        await page.waitForLoadState('networkidle')
        expect(await layoutShift(page), path).toBe(0)
      }
      await page.goto('/dictionary/search/iru/')
      await page.waitForLoadState('networkidle')
      await page.evaluate(() => {
        ;(window as unknown as { shifted: number }).shifted = 0
      })
      await page
        .locator('[data-result-row="1546640"]')
        .evaluate(row => (row as HTMLElement).click())
      await expect(page).toHaveURL(/1546640\/$/)
      await page.waitForLoadState('networkidle')
      expect(await layoutShift(page)).toBe(0)
    })
  }

  test.describe('before the page’s scripts run', () => {
    test.use({ allowedConsoleErrors: [/Failed to load resource/] })

    test('they are already applied, so the page never shows the defaults first', async ({
      page
    }) => {
      await keep(page, flipped)
      await page.route('**/_next/static/**/*.js', route => route.abort())
      await page.goto(needed.path)
      await expect(page.locator('html')).toHaveAttribute('data-romaji', 'on')
      await expect(page.getByRole('heading', { level: 1 }).locator('rt')).toBeHidden()
      await expect(aid(headline(page), 'reading')).toBeVisible()
      await expect(aid(page, 'romaji').first()).toBeVisible()
      await expect(page.getByText('be needed', { exact: true }).first()).toBeVisible()
      await expect(page.getByText(firstExample).filter({ visible: true })).toHaveCount(0)
    })
  })
})
