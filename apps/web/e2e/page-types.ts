import type { Locator, Page } from '@playwright/test'
import { appAreasIn } from '../src/lib/app-areas'
import type { Locale } from '../src/lib/i18n/config'
import { getDictionary } from '../src/lib/i18n/dictionary'
import { sitePagesIn } from '../src/lib/pages'
import { siteMenusIn } from '../src/lib/site-menus'
import { toolPagesIn } from '../src/lib/tools/tool-pages'
import { signedOutService, standInForTheAccountService } from './account-stand-in'
import { accountPages, expect, needed, phoneMenu, sourcesToggle, test } from './test'

export interface PageView {
  name: string
  show: (page: Page) => Promise<void>
  overlay?: boolean
}

export interface PageType {
  name: string
  path: string
  open?: string[]
  views?: PageView[]
}

const browse = (path = '') => `/dictionary/browse/${path}`
const japanese = (path: string) => encodeURI(path)

const runningFiniteAnimations = (page: Page) =>
  page.evaluate(
    () =>
      document
        .getAnimations()
        .filter(
          animation =>
            animation.playState === 'running' &&
            animation.effect?.getComputedTiming().endTime !== Number.POSITIVE_INFINITY
        ).length
  )

async function settle(page: Page) {
  await expect(page.locator('[data-starting-style], [data-ending-style]')).toHaveCount(0)
  await expect.poll(() => runningFiniteAnimations(page)).toBe(0)
}

const clickBeforeHydrationIsLost = { timeout: 1_000 }
const untilItTakes = { timeout: 15_000 }

async function pressToExpand(button: Locator) {
  await expect(async () => {
    if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click()
    await expect(button).toHaveAttribute('aria-expanded', 'true', clickBeforeHydrationIsLost)
  }).toPass(untilItTakes)
}

async function expand(page: Page, name: string) {
  await pressToExpand(page.getByRole('button', { name, exact: true }))
  await settle(page)
}

async function expandMenuSection(page: Page, name: string) {
  const menu = phoneMenu(page)
  const button = menu.getByRole('button', { name, exact: true })
  await pressToExpand(button)
  await expect(menu.locator(`[id="${await button.getAttribute('aria-controls')}"]`)).toBeVisible()
  await expect(menu.locator('[data-slot="accordion-content"]:visible')).toHaveCount(1)
  await settle(page)
}

const showcaseArea = (name: string): PageView => ({
  name,
  show: async page => {
    const tab = page.getByRole('tab', { name, exact: true })
    await tab.click()
    await expect(tab).toHaveAttribute('aria-selected', 'true')
    await settle(page)
  }
})

function phoneMenuViews(locale: Locale): PageView[] {
  const menu = getDictionary(locale).chrome.menu
  return [
    {
      name: 'Phone menu',
      overlay: true,
      show: async page => {
        const button = page.getByRole('banner').getByRole('button', { name: menu })
        await expect(async () => {
          if (!(await phoneMenu(page).isVisible())) await button.click()
          await expect(phoneMenu(page)).toBeVisible(clickBeforeHydrationIsLost)
        }).toPass(untilItTakes)
        await settle(page)
      }
    },
    ...siteMenusIn(locale).map(({ label }) => ({
      name: `Phone menu, ${label}`,
      overlay: true,
      show: (page: Page) => expandMenuSection(page, label)
    }))
  ]
}

export const radicalPanel = (page: Page, locale: Locale) =>
  page.getByRole('dialog', { name: getDictionary(locale).searchForm.radicals.title })

export async function openRadicalPanel(page: Page, locale: Locale) {
  const panel = radicalPanel(page, locale)
  const button = page
    .getByRole('main')
    .getByRole('button', { name: getDictionary(locale).searchForm.radicals.open, exact: true })
  await expect(async () => {
    if (!(await panel.isVisible())) await button.click()
    await expect(panel).toBeVisible(clickBeforeHydrationIsLost)
  }).toPass(untilItTakes)
  await expect(panel.getByRole('group').first()).toBeVisible()
  await settle(page)
}

const viewsIn = (locale: Locale): Record<string, PageView[]> => ({
  '/': appAreasIn(locale)
    .slice(1)
    .map(({ name }) => showcaseArea(name)),
  '/about/': phoneMenuViews(locale),
  '/dictionary/search/iru/': [
    { name: 'Radicals panel', overlay: true, show: page => openRadicalPanel(page, locale) }
  ]
})

const viewsOf = viewsIn('en')

export const missingPage: PageType = { name: 'Page not found', path: '/no-such-page/' }

export const pageTypes: PageType[] = [
  ...sitePagesIn('en').map(({ title, path }) => ({ name: title, path, views: viewsOf[path] })),
  ...accountPages.map(({ title, path }) => ({ name: title, path })),
  ...toolPagesIn('en').map(({ title, path }) => ({ name: title, path })),
  { name: 'Search', path: '/dictionary/search/' },
  {
    name: 'Search results',
    path: '/dictionary/search/iru/',
    views: viewsOf['/dictionary/search/iru/']
  },
  {
    name: 'Kanji details',
    path: japanese('/dictionary/search/要/'),
    open: ['要, kanji, pivot, shows kanji details']
  },
  {
    name: 'Word',
    path: `${needed.path}#conjugations`,
    open: ['Past, 要った, いった', '要, need, main point, shows kanji details']
  },
  { name: 'Browse', path: browse() },
  { name: 'Kana charts', path: browse('kana/') },
  { name: 'Hiragana', path: browse('hiragana/') },
  { name: 'Katakana', path: browse('katakana/') },
  { name: 'Words by first kana', path: japanese(browse('hiragana/い/')) },
  { name: 'Words by first two kana', path: japanese(browse('hiragana/いる/')) },
  { name: 'Parts of speech', path: browse('parts-of-speech/') },
  { name: 'Usage labels', path: browse('usage/') },
  { name: 'Subjects', path: browse('subjects/') },
  { name: 'Category', path: browse('ichidan-verbs/') },
  { name: 'Category, page 2', path: browse('ichidan-verbs/2/') },
  { name: 'Category in kana order', path: browse('ichidan-verbs/kana-order/') },
  { name: 'Frequency dictionaries', path: browse('frequency-dictionaries/') },
  { name: 'Frequency band', path: browse('frequency-dictionaries/anime/1-1000/') },
  { name: 'JLPT vocabulary', path: browse('frequency-dictionaries/jlpt/n5/') },
  { name: 'Kanji lists', path: browse('kanji/') },
  { name: 'Kanji by grade', path: browse('kanji/grade-4/') },
  { name: 'JLPT kanji', path: browse('kanji/jlpt-n5/') },
  { name: 'Jinmeiyō kanji', path: browse('kanji/jinmeiyo/') }
]

const japaneseViews = viewsIn('ja')

export const japanesePageTypes: PageType[] = pageTypes.map(({ name, path }) => {
  const page = path.replace(/#.*$/, '')
  return { name: `${name} (日本語)`, path: `/ja${page}`, views: japaneseViews[page] }
})

const stillLoading = /^Loading (examples|your account)|読み込み中/

export async function openPageType(page: Page, { path, open = [] }: PageType) {
  await standInForTheAccountService(page, signedOutService)
  await page.goto(path)
  for (const name of open) await expand(page, name)
  await expect(page.getByText(stillLoading)).toHaveCount(0)
  await settle(page)
}

export async function checkEachView(
  page: Page,
  pageType: PageType,
  check: (view: string) => Promise<void>,
  views: (view: PageView) => boolean = () => true
) {
  await openPageType(page, pageType)
  if (await sourcesToggle(page).count()) await sourcesToggle(page).click()
  await check(pageType.name)
  for (const view of (pageType.views ?? []).filter(views)) {
    await view.show(page)
    await check(`${pageType.name}, ${view.name}`)
  }
}

export function testEachPageType(
  title: (pageType: PageType) => string,
  body: (page: Page, pageType: PageType) => Promise<void>,
  types: readonly PageType[] = pageTypes
) {
  for (const pageType of types) test(title(pageType), ({ page }) => body(page, pageType))
  test.describe('a missing page', () => {
    test.use({ allowedConsoleErrors: [/status of 404/] })
    test(title(missingPage), ({ page }) => body(page, missingPage))
  })
}
