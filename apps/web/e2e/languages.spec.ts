import type { Locator, Page } from '@playwright/test'
import { expect, menuButton, needed, onPhone, phoneMenu, test } from './test'

type Language = 'en' | 'ja'

const labels = {
  en: { trigger: 'English, change language', list: 'Language', menu: 'Menu' },
  ja: { trigger: '日本語、表示言語を切り替える', list: '言語', menu: 'メニュー' }
} as const

type Item = { name: string; href: string | null; current: boolean }

const untilHydrated = { timeout: 15_000 }
const clickBeforeHydrationIsLost = { timeout: 1_000 }

async function openUntil(trigger: Locator, opened: Locator) {
  await expect(async () => {
    if (!(await opened.isVisible())) await trigger.click()
    await expect(opened).toBeVisible(clickBeforeHydrationIsLost)
  }).toPass(untilHydrated)
}

const headerTrigger = (page: Page, language: Language) =>
  page.getByRole('banner').getByRole('button', { name: labels[language].trigger })

const footerTrigger = (page: Page, language: Language) =>
  page.getByRole('contentinfo').getByRole('button', { name: labels[language].trigger })

async function menuItems(page: Page): Promise<Item[]> {
  const items = page.getByRole('menu').getByRole('menuitem')
  await expect(items).toHaveCount(2)
  return Promise.all(
    (await items.all()).map(async item => ({
      name: (await item.textContent())?.trim() ?? '',
      href: await item.getAttribute('href'),
      current: (await item.getAttribute('aria-current')) === 'true'
    }))
  )
}

async function drawerItems(page: Page, language: Language): Promise<Item[]> {
  await openUntil(
    page.getByRole('banner').getByRole('button', { name: labels[language].menu }),
    phoneMenu(page)
  )
  const list = phoneMenu(page).getByRole('navigation', { name: labels[language].list })
  const entries = list.getByRole('listitem')
  await expect(entries).toHaveCount(2)
  return Promise.all(
    (await entries.all()).map(async entry => {
      const link = entry.getByRole('link')
      const isLink = (await link.count()) > 0
      return {
        name: (await entry.textContent())?.trim() ?? '',
        href: isLink ? await link.getAttribute('href') : null,
        current: !isLink
      }
    })
  )
}

async function switcherItems(page: Page, language: Language): Promise<Item[]> {
  if (onPhone()) return drawerItems(page, language)
  await openUntil(headerTrigger(page, language), page.getByRole('menu'))
  return menuItems(page)
}

const current = (name: string): Item => ({ name, href: null, current: true })
const link = (name: string, href: string): Item => ({ name, href, current: false })

test.describe('the language switcher', () => {
  for (const [path, language, items] of [
    ['/about/', 'en', [current('English'), link('日本語', '/ja/about/')]],
    ['/ja/about/', 'ja', [link('English', '/about/'), current('日本語')]],
    ['/', 'en', [current('English'), link('日本語', '/ja/')]],
    ['/ja/', 'ja', [link('English', '/'), current('日本語')]],
    [needed.path, 'en', [current('English'), link('日本語', `/ja${needed.path}`)]],
    [
      '/ja/dictionary/browse/kana/',
      'ja',
      [link('English', '/dictionary/browse/kana/'), current('日本語')]
    ]
  ] as const) {
    test(`on ${decodeURI(path)}, a translated page, each language links to the same page in that language`, async ({
      page
    }) => {
      await page.goto(path)
      expect(await switcherItems(page, language)).toEqual(items)
    })
  }

  test.describe('on a page with no other language', () => {
    test.use({ allowedConsoleErrors: [/status of 404/] })

    test('a missing page links each other language to its homepage', async ({ page }) => {
      expect((await page.goto('/no-such-page/'))?.status()).toBe(404)
      expect(await switcherItems(page, 'en')).toEqual([current('English'), link('日本語', '/ja/')])
    })

    test('a missing Japanese page links English to its homepage', async ({ page }) => {
      expect((await page.goto('/ja/dictionary/999999999/'))?.status()).toBe(404)
      expect(await switcherItems(page, 'ja')).toEqual([link('English', '/'), current('日本語')])
    })
  })

  test('each item of a translated page lands on a 200 page in its language, with no redirect', async ({
    request
  }) => {
    for (const [path, lang] of [
      ['/ja/about/', 'ja'],
      ['/about/', 'en'],
      ['/ja/', 'ja'],
      ['/', 'en'],
      [`/ja${needed.path}`, 'ja'],
      ['/ja/dictionary/browse/kana/', 'ja']
    ]) {
      const response = await request.get(path, { maxRedirects: 0 })
      expect(response.status(), path).toBe(200)
      expect(await response.text(), path).toMatch(new RegExp(`<html lang="${lang}"`))
    }
  })

  test('following 日本語 opens the Japanese page in one full page load, and English comes back', async ({
    page,
    context
  }) => {
    await page.goto('/about/')
    const cookies = await context.cookies()
    await switcherItems(page, 'en')
    const container = onPhone() ? phoneMenu(page) : page.getByRole('menu')
    const [japanese] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === '/ja/about/'),
      container.getByRole(onPhone() ? 'link' : 'menuitem', { name: '日本語' }).click()
    ])
    expect(japanese.status()).toBe(200)
    expect(japanese.request().redirectedFrom()).toBeNull()
    await expect(page).toHaveURL(/\/ja\/about\/$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja')
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('About')
    expect(await context.cookies()).toEqual(cookies)
    const english = await page.goto('/about/')
    expect(english?.status()).toBe(200)
    expect(english?.request().redirectedFrom()).toBeNull()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })

  test.describe('from 1024 pixels', () => {
    test.beforeEach(() => {
      test.skip(onPhone(), 'Below 1024 pixels the phone menu holds the languages')
    })

    test('the header menu opens and follows a language by keyboard, each named in itself', async ({
      page
    }) => {
      await page.goto('/about/')
      const trigger = headerTrigger(page, 'en')
      await expect(trigger).toHaveText('English')
      await expect(async () => {
        await trigger.focus()
        await page.keyboard.press('Enter')
        await expect(page.getByRole('menu')).toBeVisible(clickBeforeHydrationIsLost)
      }).toPass(untilHydrated)
      const japanese = page.getByRole('menuitem', { name: '日本語' })
      await expect(japanese).toHaveAttribute('lang', 'ja')
      await expect(japanese).toHaveAttribute('hreflang', 'ja')
      await page.keyboard.press('ArrowDown')
      await expect(japanese).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(/\/ja\/about\/$/)
      await expect(headerTrigger(page, 'ja')).toHaveText('日本語')
    })
  })

  test('the footer has the same menu on every width', async ({ page }) => {
    await page.goto('/ja/legal/terms/')
    await openUntil(footerTrigger(page, 'ja'), page.getByRole('menu'))
    expect(await menuItems(page)).toEqual([link('English', '/legal/terms/'), current('日本語')])
  })

  test('the header shows the menu from 1024 pixels and the phone menu below, never both', async ({
    page
  }) => {
    await page.goto('/about/')
    await expect(headerTrigger(page, 'en')).toBeVisible({ visible: !onPhone() })
    await expect(menuButton(page)).toBeVisible({ visible: onPhone() })
  })
})
