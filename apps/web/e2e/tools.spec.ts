import type { Page } from '@playwright/test'
import { getDictionary } from '../src/lib/i18n/dictionary'
import { localizedPath } from '../src/lib/i18n/paths'
import { converterFor } from '../src/lib/tools/converters'
import { toolsPath } from '../src/lib/tools/paths'
import { referenceToolsIn } from '../src/lib/tools/reference-tools'
import {
  converterPageIn,
  converterPagesIn,
  questionsIn,
  toolPagesIn,
  toolsIndexIn
} from '../src/lib/tools/tool-pages'
import { expect, onPhone, test } from './test'

const converters = converterPagesIn('en')
const referenceTools = referenceToolsIn('en')
const toolsIndex = toolsIndexIn('en')

const main = (page: Page) => page.getByRole('main')
const box = (page: Page, name: string) => main(page).getByRole('textbox', { name, exact: true })

async function typeAndSee(
  page: Page,
  typedIn: string,
  other: string,
  text: string,
  expected: string
) {
  await expect(async () => {
    await box(page, typedIn).fill(text)
    await expect(box(page, other)).toHaveValue(expected, { timeout: 1_000 })
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
      'Online tools for learning Japanese'
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

  test('in Japanese, at /ja/tools/, its cards read in Japanese and lead to Japanese pages', async ({
    page,
    request
  }) => {
    const text = getDictionary('ja').tools
    await page.goto('/ja/tools/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja')
    await expect(main(page).getByRole('heading', { level: 1 })).toHaveText(text.index.title)
    const cards = [
      ...converterPagesIn('ja').map(c => ({ title: c.name, href: localizedPath(c.path, 'ja') })),
      ...referenceToolsIn('ja').map(tool => ({ ...tool, href: localizedPath(tool.href, 'ja') }))
    ]
    await expect(
      main(page)
        .getByRole('list', { name: text.index.converters })
        .getByRole('heading', { level: 3 })
    ).toHaveText(converterPagesIn('ja').map(converter => converter.name))
    for (const card of cards) {
      const link = main(page).getByRole('link', { name: card.title, exact: true })
      await expect(link).toHaveAttribute('href', card.href)
      expect((await request.get(card.href, { maxRedirects: 0 })).status(), card.href).toBe(200)
    }
    await expect(
      main(page)
        .getByRole('region', { name: text.appCard.label })
        .getByRole('button', {
          name: getDictionary('ja').chrome.getTheApp
        })
    ).toHaveAttribute('href', '/ja/products/zenbu-japanese-app/')
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
  await page.goto('/ja/sitemap/')
  const japanese = toolsIndexIn('ja')
  for (const tool of [{ name: japanese.title, path: japanese.path }, ...converterPagesIn('ja')]) {
    await expect(main(page).getByRole('link', { name: tool.name, exact: true })).toHaveAttribute(
      'href',
      localizedPath(tool.path, 'ja')
    )
  }
})

test.describe('a converter page', () => {
  test('converts as you type, counts the characters, and Clear empties both boxes', async ({
    page
  }) => {
    await page.goto('/tools/hiragana-to-katakana/')
    await typeAndSee(page, 'Hiragana', 'Katakana', 'すし と らーめん', 'スシ ト ラーメン')
    await expect(main(page).getByText('9 characters')).toHaveCount(2)
    await main(page).getByRole('button', { name: 'Clear' }).click()
    await expect(box(page, 'Hiragana')).toHaveValue('')
    await expect(box(page, 'Katakana')).toHaveValue('')
    await expect(box(page, 'Hiragana')).toBeFocused()
  })

  test('in Japanese, its boxes, count, options, and links are in Japanese', async ({ page }) => {
    const text = getDictionary('ja').tools
    const converter = converterPageIn('half-width-to-full-width', 'ja')
    await page.goto('/ja/tools/half-width-to-full-width/')
    await expect(main(page).getByRole('heading', { level: 1 })).toHaveText(converter.name)
    await typeAndSee(page, converter.from, converter.to, 'ﾊﾟﾝ ABC', 'パン　ＡＢＣ')
    await expect(
      main(page).getByText(text.converter.characters.other.replace('{count}', '7'), { exact: true })
    ).toHaveCount(1)
    await main(page).getByText(text.converter.widths.lettersAndNumbers, { exact: true }).click()
    await expect(box(page, converter.to)).toHaveValue('パン　ABC')
    const counterpart = converterPageIn(converter.reverse, 'ja')
    await expect(
      main(page).getByRole('link', { name: counterpart.name, exact: true })
    ).toHaveAttribute('href', localizedPath(counterpart.path, 'ja'))
    await expect(main(page).getByRole('link', { name: text.page.allTools })).toHaveAttribute(
      'href',
      localizedPath(toolsPath, 'ja')
    )
  })

  test('typing in the bottom box fills the top one, and the bottom keeps exactly what was typed', async ({
    page
  }) => {
    await page.goto('/tools/romaji-to-kana/')
    await typeAndSee(page, 'Kana', 'Romaji', 'コーヒー と まっちゃ', 'koohii to matcha')
    await expect(box(page, 'Kana')).toHaveValue('コーヒー と まっちゃ')
    await box(page, 'Kana').pressSequentially('。')
    await expect(box(page, 'Romaji')).toHaveValue('koohii to matcha.')
    await expect(box(page, 'Kana')).toHaveValue('コーヒー と まっちゃ。')
    await typeAndSee(page, 'Romaji', 'Kana', 'kitte', 'きって')
  })

  test('a Try example fills the top box', async ({ page }) => {
    await page.goto('/tools/kana-to-romaji/')
    await typeAndSee(page, 'Kana', 'Romaji', '', '')
    await main(page).getByRole('button', { name: 'きんえん' }).click()
    await expect(box(page, 'Kana')).toHaveValue('きんえん')
    await expect(box(page, 'Romaji')).toHaveValue("kin'en")
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
    await expect(box(page, 'Kana')).toHaveValue('コーヒー ト マッチャ')
  })

  test('the width options choose what changes, both ways', async ({ page }) => {
    await page.goto('/tools/half-width-to-full-width/')
    await typeAndSee(page, 'Half-width', 'Full-width', 'ｶﾞｯｺｳ ﾊﾟﾝ ABC', 'ガッコウ　パン　ＡＢＣ')
    await main(page).getByText('Letters and numbers').click()
    await expect(
      main(page).getByRole('checkbox', { name: 'Letters and numbers' })
    ).not.toBeChecked()
    await expect(box(page, 'Full-width')).toHaveValue('ガッコウ　パン　ABC')
    await main(page).getByText('Symbols and spaces').click()
    await expect(box(page, 'Full-width')).toHaveValue('ガッコウ パン ABC')
    await box(page, 'Full-width').fill('ガッコウ　ＡＢＣ')
    await expect(box(page, 'Half-width')).toHaveValue('ｶﾞｯｺｳ　ＡＢＣ')
  })

  test('each page links the other direction under its converter', async ({ page }) => {
    await page.goto('/tools/hiragana-to-katakana/')
    const counterpart = main(page).getByRole('link', { name: 'Katakana to Hiragana', exact: true })
    await expect(counterpart).toHaveCount(1)
    await counterpart.click()
    await expect(page).toHaveURL('/tools/katakana-to-hiragana/')
    await expect(main(page).getByRole('heading', { level: 1 })).toHaveText('Katakana to Hiragana')
  })

  test('each box’s Copy copies its text and says so', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/tools/full-width-to-half-width/')
    await typeAndSee(page, 'Full-width', 'Half-width', 'ＡＢＣ　カタカナ', 'ABC ｶﾀｶﾅ')
    await main(page).getByRole('button', { name: 'Copy Half-width' }).click()
    await expect(main(page).getByText('Copied')).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('ABC ｶﾀｶﾅ')
    await main(page).getByRole('button', { name: 'Copy Full-width' }).click()
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe('ＡＢＣ　カタカナ')
  })

  test('the conversion chart shows its groups in tabs, every kana in the page', async ({
    page
  }) => {
    await page.goto('/tools/kana-to-romaji/')
    const groups = main(page).getByRole('tablist', { name: 'Kana groups' })
    const chart = (name: string) => main(page).getByRole('list', { name, exact: true })
    const tile = (name: string, pair: string) =>
      chart(name)
        .getByRole('listitem')
        .filter({ has: page.getByText(pair, { exact: true }) })
    await expect(groups.getByRole('tab')).toHaveText(['Basic', 'Combos', 'Katakana'])
    await expect(tile('Basic', 'か カ')).toHaveText('か カka')
    await expect(tile('With marks', 'が ガ')).toHaveText('が ガga')
    await expect(tile('Small kana', 'っ ッ')).toHaveText('っ ッxtsu, xtu, ltu')
    await expect(main(page).locator('[role="tabpanel"] li:not([aria-hidden])')).toHaveCount(131)
    const combinations = groups.getByRole('tab', { name: 'Combos' })
    await expect(async () => {
      await combinations.click()
      await expect(combinations).toHaveAttribute('aria-selected', 'true', { timeout: 1_000 })
    }).toPass({ timeout: 15_000 })
    await expect(chart('Basic')).toBeHidden()
    await expect(chart('Combinations').getByRole('listitem').first()).toHaveText('きゃ キャkya')
    await expect(main(page).getByRole('link', { name: /^Full kana charts/ })).toHaveAttribute(
      'href',
      '/dictionary/browse/kana/'
    )
  })

  test('a question opens to its answer', async ({ page }) => {
    await page.goto('/tools/romaji-to-kana/')
    const [first] = questionsIn('romaji', 'en')
    const answer = main(page).getByText(first.answer)
    const question = main(page).getByRole('button', { name: first.question })
    await expect(answer).toBeHidden()
    await expect(async () => {
      await question.click()
      await expect(question).toHaveAttribute('aria-expanded', 'true', { timeout: 1_000 })
    }).toPass({ timeout: 15_000 })
    await expect(answer).toBeVisible()
  })

  test('related tools lead to their pages, and All tools to the index', async ({ page }) => {
    await page.goto('/tools/half-width-to-full-width/')
    const related = main(page).getByRole('list', { name: 'Related tools' })
    for (const slug of converterFor('half-width-to-full-width').related) {
      const converter = converterPageIn(slug, 'en')
      await expect(related.getByRole('link', { name: converter.name })).toHaveAttribute(
        'href',
        converter.path
      )
    }
    await main(page).getByRole('link', { name: 'All tools' }).click()
    await expect(page).toHaveURL('/tools/')
  })
})

test.describe('tools addresses', () => {
  test.beforeEach(desktopOnly)
  test.use({ allowedConsoleErrors: [/status of 404/] })

  test('a converter name the site doesn’t have is 404', async ({ page, request }) => {
    expect((await request.get('/tools/no-such-tool/', { maxRedirects: 0 })).status()).toBe(404)
    await page.goto('/tools/no-such-tool/')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  })
})

test.describe('the tools pages’ metadata', () => {
  test.beforeEach(desktopOnly)

  for (const [locale, tool] of (['en', 'ja'] as const).flatMap(locale =>
    toolPagesIn(locale).map(
      page => [locale, { ...page, path: localizedPath(page.path, locale) }] as const
    )
  )) {
    test(`${tool.path} has its title, description, canonical URL, and structured data`, async ({
      page
    }) => {
      await page.goto(tool.path)
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
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
      expect(types).toEqual(tool.path === localizedPath(toolsPath, locale) ? [] : ['FAQPage'])
      await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
    })
  }
})
