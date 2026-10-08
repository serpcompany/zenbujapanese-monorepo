import type { Page } from '@playwright/test'
import { appAreas } from '../src/lib/app-areas'
import { sitePages } from '../src/lib/pages'
import { expect, needed } from './test'

export interface PageType {
  name: string
  path: string
  open?: string[]
  tabs?: string[]
}

const browse = (path = '') => `/dictionary/browse/${path}`
const japanese = (path: string) => encodeURI(path)

export const missingPage: PageType = { name: 'Page not found', path: '/no-such-page/' }

const showcaseTabs = { tabs: appAreas.slice(1).map(({ name }) => name) }

export const pageTypes: PageType[] = [
  ...sitePages.map(({ title, path }) => ({
    name: title,
    path,
    ...(path === '/' ? showcaseTabs : {})
  })),
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
  await page.goto(path)
  for (const name of open) {
    const button = page.getByRole('button', { name, exact: true })
    await button.click()
    await expect(button).toHaveAttribute('aria-expanded', 'true')
  }
  await expect(page.getByText('Loading examples')).toHaveCount(0)
}

export async function selectTab(page: Page, name: string) {
  const tab = page.getByRole('tab', { name, exact: true })
  await tab.click()
  await expect(tab).toHaveAttribute('aria-selected', 'true')
}
