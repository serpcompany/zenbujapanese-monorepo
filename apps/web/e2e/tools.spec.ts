import type { Page } from '@playwright/test'
import { questions } from '../src/lib/tools/content'
import { converterFor, converters, toolPages, toolsIndex } from '../src/lib/tools/converters'
import { referenceTools } from '../src/lib/tools/reference-tools'
import { expect, onPhone, test } from './test'

const main = (page: Page) => page.getByRole('main')
const input = (page: Page, name: string) => main(page).getByRole('textbox', { name })
const result = (page: Page, name: string) => main(page).getByRole('status', { name })
const swap = (page: Page, to: string) => main(page).getByRole('link', { name: `Switch to ${to}` })
const rows = (page: Page) => main(page).getByRole('group', { name: 'Rows' })

async function typeAndSee(page: Page, from: string, to: string, text: string, expected: string) {
  await expect(async () => {
    await input(page, from).fill(text)
    await expect(result(page, to)).toHaveText(expected, { timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
}

const desktopOnly = () =>
  test.skip(onPhone(), 'A page’s HTML and metadata are the same at every width')

test.describe('the tools index', () => {
  test('lists the six converters, then the dictionary and reference pages, then the app', async ({
    page
  }) => {
    await page.goto('/tools/')
    await expect(main(page).getByRole('heading', { level: 1 })).toHaveText(
      'Free Japanese converters'
    )
    await expect(
      main(page).getByRole('list', { name: 'Converters' }).getByRole('heading', { level: 3 })
    ).toHaveText(converters.map(converter => converter.name))
    await expect(
      main(page)
        .getByRole('list', { name: 'Dictionary and reference' })
        .getByRole('heading', { level: 3 })
    ).toHaveText(referenceTools.map(tool => tool.title))
    await expect(
      main(page).getByRole('region', { name: 'The Zenbu app' }).getByRole('button', {
        name: 'Get the app'
      })
    ).toHaveAttribute('href', '/products/zenbu-japanese-app/')
  })

  test('each card leads to its page, with no redirect', async ({ page, request }) => {
    await page.goto('/tools/')
    for (const card of [
      ...converters.map(c => ({ title: c.name, href: c.path })),
      ...referenceTools
    ]) {
      const link = main(page).getByRole('link', { name: card.title, exact: true })
      await expect(link).toHaveAttribute('href', card.href)
      expect((await request.get(card.href, { maxRedirects: 0 })).status(), card.href).toBe(200)
    }
    await main(page).getByRole('link', { name: 'Romaji to Kana', exact: true }).click()
    await expect(page).toHaveURL('/tools/romaji-to-kana/')
    await expect(main(page).getByRole('heading', { level: 1 })).toHaveText('Romaji to Kana')
  })
})

test('the HTML sitemap lists the tools index and every converter', async ({ page }) => {
  await page.goto('/sitemap/')
  for (const tool of [{ name: toolsIndex.title, path: toolsIndex.path }, ...converters]) {
    await expect(main(page).getByRole('link', { name: tool.name, exact: true })).toHaveAttribute(
      'href',
      tool.path
    )
  }
})

test.describe('a converter page', () => {
  test('converts as you type, counts the characters, and clears', async ({ page }) => {
    await page.goto('/tools/hiragana-to-katakana/')
    await typeAndSee(page, 'Hiragana', 'Katakana', 'すし と らーめん', 'スシ ト ラーメン')
    await expect(main(page).getByText('9 characters')).toBeVisible()
    await main(page).getByRole('button', { name: 'Clear' }).click()
    await expect(input(page, 'Hiragana')).toHaveValue('')
    await expect(input(page, 'Hiragana')).toBeFocused()
    await expect(result(page, 'Katakana')).toHaveText('The result shows here.')
  })

  test('a Try example fills the input', async ({ page }) => {
    await page.goto('/tools/kana-to-romaji/')
    await typeAndSee(page, 'Kana', 'Romaji', '', 'The result shows here.')
    await main(page).getByRole('button', { name: 'きんえん' }).click()
    await expect(input(page, 'Kana')).toHaveValue('きんえん')
    await expect(result(page, 'Romaji')).toHaveText("kin'en")
  })

  test('romaji to kana writes hiragana, or katakana when it is chosen', async ({ page }) => {
    await page.goto('/tools/romaji-to-kana/')
    await typeAndSee(page, 'Romaji', 'Kana', 'ko-hi- to matcha', 'こーひー と まっちゃ')
    const writeIn = main(page).getByRole('group', { name: 'Write in' })
    await expect(writeIn.getByRole('button', { name: 'Hiragana' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await writeIn.getByRole('button', { name: 'Katakana' }).click()
    await expect(result(page, 'Kana')).toHaveText('コーヒー ト マッチャ')
  })

  test('the width options choose what changes', async ({ page }) => {
    await page.goto('/tools/half-width-to-full-width/')
    await typeAndSee(page, 'Half-width', 'Full-width', 'ｶﾞｯｺｳ ﾊﾟﾝ ABC', 'ガッコウ　パン　ＡＢＣ')
    await main(page).getByText('Letters and numbers').click()
    await expect(
      main(page).getByRole('checkbox', { name: 'Letters and numbers' })
    ).not.toBeChecked()
    await expect(result(page, 'Full-width')).toHaveText('ガッコウ　パン　ABC')
    await main(page).getByText('Symbols and spaces').click()
    await expect(result(page, 'Full-width')).toHaveText('ガッコウ パン ABC')
  })

  test('swapping opens the other direction without reloading, keeps the scroll, and carries the result over', async ({
    page
  }) => {
    await page.goto('/tools/hiragana-to-katakana/')
    await typeAndSee(page, 'Hiragana', 'Katakana', 'こーひー', 'コーヒー')
    await page.evaluate(() => {
      window.scrollTo(0, 150)
      Object.assign(window, { stillTheSamePage: true })
    })
    const scrolled = await page.evaluate(() => window.scrollY)
    await swap(page, 'Katakana to Hiragana').click()
    await expect(page).toHaveURL('/tools/katakana-to-hiragana/')
    await expect(main(page).getByRole('heading', { level: 1 })).toHaveText('Katakana to Hiragana')
    await expect(input(page, 'Katakana')).toHaveValue('コーヒー')
    await expect(result(page, 'Hiragana')).toHaveText('こーひー')
    expect(await page.evaluate(() => 'stillTheSamePage' in window)).toBe(true)
    expect(await page.evaluate(() => window.scrollY)).toBe(scrolled)
    await page.goBack()
    await expect(page).toHaveURL('/tools/hiragana-to-katakana/')
    await expect(input(page, 'Hiragana')).toHaveValue('こーひー')
  })

  test('Copy copies the result and says so', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/tools/full-width-to-half-width/')
    await typeAndSee(page, 'Full-width', 'Half-width', 'ＡＢＣ　カタカナ', 'ABC ｶﾀｶﾅ')
    await main(page).getByRole('button', { name: 'Copy' }).click()
    await expect(main(page).getByText('Copied')).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('ABC ｶﾀｶﾅ')
  })

  test('the conversion table’s filter shows one group, and All brings back the rest', async ({
    page
  }) => {
    await page.goto('/tools/kana-to-romaji/')
    const table = main(page).getByRole('table').last()
    const group = (name: string) => table.getByRole('rowheader', { name: new RegExp(`^${name}`) })
    await expect(table.getByRole('row')).toHaveCount(1 + 5 + 131)
    await expect(async () => {
      await rows(page).getByRole('button', { name: 'Small kana' }).click()
      await expect(group('Basic')).toBeHidden({ timeout: 1_000 })
    }).toPass({ timeout: 15_000 })
    await expect(group('Small kana')).toBeVisible()
    await expect(table.getByRole('cell', { name: 'xtu, ltu' })).toBeVisible()
    await rows(page).getByRole('button', { name: 'All', exact: true }).click()
    await expect(group('Basic')).toBeVisible()
    await expect(group('Katakana only')).toBeVisible()
  })

  test('the kana chart’s tabs show each chart', async ({ page }) => {
    await page.goto('/tools/hiragana-to-katakana/')
    const combinations = main(page).getByRole('tab', { name: 'Combinations' })
    await expect(async () => {
      await combinations.click()
      await expect(combinations).toHaveAttribute('aria-selected', 'true', { timeout: 1_000 })
    }).toPass({ timeout: 15_000 })
    await expect(main(page).getByRole('list', { name: 'Combinations kana' })).toBeVisible()
    await expect(main(page).getByRole('list', { name: 'Basic kana' })).toBeHidden()
  })

  test('a question opens to its answer', async ({ page }) => {
    await page.goto('/tools/romaji-to-kana/')
    const [first] = questions.romaji
    const answer = main(page).getByText(first.answer)
    await expect(answer).toBeHidden()
    await main(page).getByText(first.question).click()
    await expect(answer).toBeVisible()
  })

  test('related tools lead to their pages', async ({ page }) => {
    await page.goto('/tools/half-width-to-full-width/')
    const related = main(page).getByRole('list', { name: 'Related tools' })
    for (const slug of converterFor('half-width-to-full-width').related) {
      const converter = converterFor(slug)
      await expect(related.getByRole('link', { name: converter.name })).toHaveAttribute(
        'href',
        converter.path
      )
    }
  })
})

test.describe('the tools pages’ metadata', () => {
  test.beforeEach(desktopOnly)

  for (const tool of toolPages) {
    test(`${tool.path} has its title, description, canonical URL, and structured data`, async ({
      page
    }) => {
      await page.goto(tool.path)
      await expect(page).toHaveTitle(`${tool.title} | Zenbu Japanese`)
      await expect(page.locator('meta[name="description"]')).toHaveAttribute(
        'content',
        tool.description
      )
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `https://zenbujapanese.com${tool.path}`
      )
      const structured = await page.locator('script[type="application/ld+json"]').allTextContents()
      const types = structured.map(json => JSON.parse(json)['@type'])
      expect(types).toEqual(tool.path === toolsIndex.path ? [] : ['FAQPage'])
    })
  }
})
