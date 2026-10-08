import {
  browsePath,
  categoryIndexes,
  frequencyDictionariesPath,
  jlptVocabularyPath,
  kanjiListsPath,
  scriptPath
} from '@/lib/dictionary/browse/paths'
import { pageFor } from '@/lib/pages'

export type MenuSymbol = 'search' | 'chart' | 'tag' | 'list'

export type MenuLink = {
  title: string
  description: string
  path: string
  mark: { glyph: string } | { symbol: MenuSymbol }
}

export type MegaMenu = {
  kind: 'mega'
  label: string
  section: string
  entry: MenuLink
  feature: { title: string; description: string; action: string; screenshot: string }
  columns: { heading: string; links: MenuLink[] }[]
  footer: { note: string; title: string; path: string }
}

export type LinkMenu = {
  kind: 'links'
  label: string
  links: { title: string; path: string }[]
}

export type SiteMenu = MegaMenu | LinkMenu

const dictionaryMenu: MegaMenu = {
  kind: 'mega',
  label: 'Dictionary',
  section: '/dictionary/',
  entry: {
    title: 'Search',
    description: 'Japanese, kana, romaji, or English',
    path: '/dictionary/',
    mark: { symbol: 'search' }
  },
  feature: {
    title: 'Japanese dictionary',
    description: 'More than 200,000 words, searched in Japanese, kana, romaji, or English.',
    action: 'Open the dictionary',
    screenshot: '/screenshots/search-results.webp'
  },
  columns: [
    {
      heading: 'Kana',
      links: [
        {
          title: 'Hiragana',
          description: 'Words for every hiragana',
          path: scriptPath('hiragana'),
          mark: { glyph: 'あ' }
        },
        {
          title: 'Katakana',
          description: 'Words for every katakana',
          path: scriptPath('katakana'),
          mark: { glyph: 'ア' }
        }
      ]
    },
    {
      heading: 'Word lists',
      links: [
        {
          title: 'JLPT vocabulary',
          description: 'N5 to N1, most used first',
          path: jlptVocabularyPath(5),
          mark: { symbol: 'chart' }
        },
        {
          title: 'Frequency lists',
          description: 'YouTube, anime, manga, and more',
          path: frequencyDictionariesPath,
          mark: { symbol: 'list' }
        }
      ]
    },
    {
      heading: 'Kanji and grammar',
      links: [
        {
          title: 'Kanji by grade',
          description: 'School grades 1 to 6, and more',
          path: kanjiListsPath,
          mark: { glyph: '漢' }
        },
        {
          title: 'Parts of speech',
          description: 'Verbs, adjectives, particles, and more',
          path: categoryIndexes.partOfSpeech.path,
          mark: { symbol: 'tag' }
        }
      ]
    }
  ],
  footer: {
    note: 'Free on the web, the same entries as the app.',
    title: 'Browse everything',
    path: browsePath
  }
}

const companyMenu: LinkMenu = {
  kind: 'links',
  label: 'Company',
  links: (['/about/', '/sources/', '/support/', '/contact/', '/legal/'] as const).map(path => {
    const { title } = pageFor(path)
    return { title, path }
  })
}

export const siteMenus: readonly SiteMenu[] = [dictionaryMenu, companyMenu]

const withSlash = (path: string) => (path.endsWith('/') ? path : `${path}/`)

export const drawerLinks = (menu: MegaMenu): MenuLink[] => [
  menu.entry,
  ...menu.columns.flatMap(column => column.links)
]

export function isCurrentSection(menu: SiteMenu, pathname: string): boolean {
  const path = withSlash(pathname)
  return menu.kind === 'mega'
    ? path.startsWith(menu.section)
    : menu.links.some(link => path.startsWith(link.path))
}

export const isCurrentPage = (path: string, pathname: string) => withSlash(pathname) === path
