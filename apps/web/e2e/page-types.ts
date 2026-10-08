import type { Page } from '@playwright/test'
import { appAreas } from '../src/lib/app-areas'
import { sitePages } from '../src/lib/pages'
import { siteMenus } from '../src/lib/site-menus'
import { signedOutService, standInForTheAccountService } from './account-stand-in'
import { accountPages, expect, menuButton, needed, phoneMenu, sourcesToggle, test } from './test'

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
  await expect.poll(() => runningFiniteAnimations(page)).toBe(0)
}

const clickBeforeHydrationIsLost = { timeout: 1_000 }
const untilItTakes = { timeout: 15_000 }

async function expand(page: Page, name: string) {
  const button = page.getByRole('button', { name, exact: true })
  await expect(async () => {
    if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click()
    await expect(button).toHaveAttribute('aria-expanded', 'true', clickBeforeHydrationIsLost)
  }).toPass(untilItTakes)
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

const phoneMenuViews: PageView[] = [
  {
    name: 'Phone menu',
    overlay: true,
    show: async page => {
      await expect(async () => {
        if (!(await phoneMenu(page).isVisible())) await menuButton(page).click()
        await expect(phoneMenu(page)).toBeVisible(clickBeforeHydrationIsLost)
      }).toPass(untilItTakes)
      await settle(page)
    }
  },
  ...siteMenus.map(({ label }) => ({
    name: `Phone menu, ${label}`,
    overlay: true,
    show: (page: Page) => expand(page, label)
  }))
]

const viewsOf: Record<string, PageView[]> = {
  '/': appAreas.slice(1).map(({ name }) => showcaseArea(name)),
  '/about/': phoneMenuViews
}

export const missingPage: PageType = { name: 'Page not found', path: '/no-such-page/' }

export const pageTypes: PageType[] = [
  ...sitePages.map(({ title, path }) => ({ name: title, path, views: viewsOf[path] })),
  ...accountPages.map(({ title, path }) => ({ name: title, path })),
  { name: 'Search', path: '/dictionary/search/' },
  { name: 'Search results', path: '/dictionary/search/iru/' },
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

export async function openPageType(page: Page, { path, open = [] }: PageType) {
  await standInForTheAccountService(page, signedOutService)
  await page.goto(path)
  for (const name of open) await expand(page, name)
  await expect(page.getByText(/^Loading (examples|your account)/)).toHaveCount(0)
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
  body: (page: Page, pageType: PageType) => Promise<void>
) {
  for (const pageType of pageTypes) test(title(pageType), ({ page }) => body(page, pageType))
  test.describe('a missing page', () => {
    test.use({ allowedConsoleErrors: [/status of 404/] })
    test(title(missingPage), ({ page }) => body(page, missingPage))
  })
}
