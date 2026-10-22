import type { Locator, Page } from '@playwright/test'
import { getDictionary } from '../src/lib/i18n/dictionary'
import { localizedPath } from '../src/lib/i18n/paths'
import { furiganaReadingsUrl } from '../src/lib/tools/furigana-tool'
import { furiganaReadingsPath } from '../src/lib/tools/paths'
import { furiganaPageIn } from '../src/lib/tools/tool-pages'
import { expect, onPhone, test } from './test'

const english = getDictionary('en').tools.furigana
const words = getDictionary('en').tools.converter
const japanese = getDictionary('ja').tools.furigana
const path = furiganaPageIn('en').path

const main = (page: Page) => page.getByRole('main')
const box = (page: Page, name = english.input) =>
  main(page).getByRole('textbox', { name, exact: true })
const furiganaIn = (page: Page, name = english.output) =>
  main(page).getByLabel(name, { exact: true }).locator('ruby')
const asksForReadings = (url: URL) => url.pathname === furiganaReadingsPath

const untilHydrated = { timeout: 15_000 }
const lostBeforeHydration = { timeout: 5_000 }

async function typeOnceHydrated(
  page: Page,
  text: string,
  { name = english.input, clear = words.clear }: { name?: string; clear?: string } = {}
) {
  await clickAndSee(main(page).getByRole('button', { name: clear, exact: true }), () =>
    expect(box(page, name)).toHaveValue('', lostBeforeHydration)
  )
  await box(page, name).fill(text)
}

async function clickAndSee(button: Locator, see: () => Promise<void>) {
  await expect(async () => {
    await button.click()
    await see()
  }).toPass(untilHydrated)
}

test.describe('Kanji to Furigana', () => {
  test('shows its sample with furigana, and reads what is typed by whole words, in context', async ({
    page
  }) => {
    await page.goto(path)
    await expect(main(page).getByRole('heading', { level: 1 })).toHaveText('Kanji to Furigana')
    await expect(furiganaIn(page)).toHaveText([
      '今日きょう',
      '大人おとな',
      '一人ひとり',
      '子供こども',
      '二人ふたり',
      '日本にほん',
      '映画えいが',
      '見み',
      '行い'
    ])
    await typeOnceHydrated(page, '日本語を勉強しています。')
    await expect(furiganaIn(page)).toHaveText(['日本語にほんご', '勉強べんきょう'])
    await expect(main(page).getByText('12 of 200 characters', { exact: true })).toBeVisible()
  })

  test('a Try example fills the box and reads it, and Clear empties both', async ({ page }) => {
    await page.goto(path)
    await clickAndSee(main(page).getByRole('button', { name: '明日', exact: true }), () =>
      expect(furiganaIn(page)).toHaveText(['明日あした'], lostBeforeHydration)
    )
    await expect(box(page)).toHaveValue('明日')
    await main(page).getByRole('button', { name: 'Clear' }).click()
    await expect(box(page)).toHaveValue('')
    await expect(box(page)).toBeFocused()
    await expect(main(page).getByText(english.empty)).toBeVisible()
  })

  test('says when a text is over 200 characters, and marks the box', async ({ page }) => {
    await page.goto(path)
    const tooLong = main(page).getByText(english.tooLong.replace('{limit}', '200'))
    await typeOnceHydrated(page, 'あ'.repeat(201))
    await expect(tooLong).toBeVisible()
    await expect(box(page)).toHaveAttribute('aria-invalid', 'true')
    await expect(furiganaIn(page)).toHaveCount(0)
  })

  test.describe('when the dictionary can’t answer', () => {
    test.use({ allowedConsoleErrors: [/status of 502/] })

    test('says so, keeps the text, and Try again reads it', async ({ page }) => {
      await page.route(asksForReadings, route =>
        route.fulfill({ status: 502, json: { error: 'The dictionary service didn’t answer' } })
      )
      await page.goto(path)
      await typeOnceHydrated(page, '大人')
      await expect(main(page).getByText(english.unavailable)).toBeVisible()
      await expect(box(page)).toHaveValue('大人')
      await expect(furiganaIn(page)).toHaveCount(0)
      await page.unrouteAll()
      await main(page).getByRole('button', { name: english.retry }).click()
      await expect(furiganaIn(page)).toHaveText(['大人おとな'])
    })
  })

  test('Copy puts the furigana on the clipboard as ruby, and as plain text with each reading in brackets', async ({
    page,
    context
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto(path)
    await clickAndSee(main(page).getByRole('button', { name: `Copy ${english.output}` }), () =>
      expect(main(page).getByText('Copied')).toBeVisible(lostBeforeHydration)
    )
    const copied = await page.evaluate(async () => {
      const [item] = await navigator.clipboard.read()
      return {
        html: await (await item.getType('text/html')).text(),
        plain: await (await item.getType('text/plain')).text()
      }
    })
    expect(copied.plain).toBe(
      '今日（きょう）は大人（おとな）一人（ひとり）と子供（こども）二人（ふたり）で、日本（にほん）の映画（えいが）を見（み）に行（い）きます。'
    )
    expect(copied.html).toMatch(/<ruby>今日<rp>（<\/rp><rt>きょう<\/rt><rp>）<\/rp><\/ruby>は/)
  })

  test('in Japanese, its box, count, and result read in Japanese', async ({ page }) => {
    await page.goto(localizedPath(path, 'ja'))
    await typeOnceHydrated(page, '大人', {
      name: japanese.input,
      clear: getDictionary('ja').tools.converter.clear
    })
    await expect(furiganaIn(page, japanese.output)).toHaveText(['大人おとな'])
    await expect(main(page).getByText('2／200文字', { exact: true })).toBeVisible()
  })
})

test.describe('the readings route', () => {
  test.beforeEach(() => test.skip(onPhone(), 'A route answers the same at every width'))

  test('answers a text’s furigana as JSON, unindexed, in English only, and refuses a text past 200 characters', async ({
    request
  }) => {
    const answer = await request.get(furiganaReadingsUrl('大人'))
    expect(answer.status()).toBe(200)
    expect(answer.headers()['x-robots-tag']).toMatch(/\bnoindex\b/)
    expect(await answer.json()).toEqual({ furigana: [{ text: '大人', reading: 'おとな' }] })
    expect((await request.get(`/ja${furiganaReadingsUrl('大人')}`)).status()).toBe(404)
    expect((await request.get(furiganaReadingsUrl('あ'.repeat(201)))).status()).toBe(400)
  })
})
