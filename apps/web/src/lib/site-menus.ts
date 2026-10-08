import {
  browsePath,
  categoryIndexes,
  frequencyDictionariesPath,
  jlptVocabularyPath,
  kanaChartsPath,
  kanjiListsPath,
  scriptPath
} from '@/lib/dictionary/browse/paths'
import { pageFor, type SitePath } from '@/lib/pages'
import { type LinkTo, linkTo, site } from '@/lib/site'

export type MenuSymbol =
  | 'search'
  | 'chart'
  | 'tag'
  | 'list'
  | 'grid'
  | 'type'
  | 'swap'
  | 'book'
  | 'puzzle'
  | 'file'
  | 'play'
  | 'phone'

export type MenuLink = LinkTo & {
  title: string
  description: string
  mark: { glyph: string; solid?: true } | { symbol: MenuSymbol } | { image: string }
}

export type MegaMenu = {
  kind: 'mega'
  label: string
  section: string
  lead?: MenuLink
  feature: LinkTo & {
    title: string
    description: string
    action: string
    symbol: MenuSymbol
    art: { screenshot: string } | { kana: string }
  }
  columns: { heading: string; links: MenuLink[] }[]
  footer: LinkTo & { note: string; title: string }
}

export type LinkMenu = {
  kind: 'links'
  label: string
  links: { title: string; href: string }[]
}

export type SiteMenu = MegaMenu | LinkMenu

export const pageLinkTo = (path: SitePath, title = pageFor(path).title) => ({ title, href: path })

const dictionaryLink: MenuLink = {
  title: 'Dictionary',
  description: 'Words and kanji in any script',
  href: '/dictionary/',
  mark: { symbol: 'search' }
}

const dictionaryMenu: MegaMenu = {
  kind: 'mega',
  label: 'Dictionary',
  section: '/dictionary/',
  lead: {
    title: 'Search',
    description: 'Japanese, kana, romaji, or English',
    href: '/dictionary/',
    mark: { symbol: 'search' }
  },
  feature: {
    title: 'Japanese dictionary',
    description: 'More than 200,000 words, searched in Japanese, kana, romaji, or English.',
    action: 'Open the dictionary',
    symbol: 'search',
    art: { screenshot: '/screenshots/search-results.webp' },
    href: '/dictionary/'
  },
  columns: [
    {
      heading: 'Kana',
      links: [
        {
          title: 'Hiragana',
          description: 'Words for every hiragana',
          href: scriptPath('hiragana'),
          mark: { glyph: 'あ' }
        },
        {
          title: 'Katakana',
          description: 'Words for every katakana',
          href: scriptPath('katakana'),
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
          href: jlptVocabularyPath(5),
          mark: { symbol: 'chart' }
        },
        {
          title: 'Frequency lists',
          description: 'YouTube, anime, manga, and more',
          href: frequencyDictionariesPath,
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
          href: kanjiListsPath,
          mark: { glyph: '漢' }
        },
        {
          title: 'Parts of speech',
          description: 'Verbs, adjectives, particles, and more',
          href: categoryIndexes.partOfSpeech.path,
          mark: { symbol: 'tag' }
        }
      ]
    }
  ],
  footer: {
    note: 'Free on the web, the same entries as the app.',
    title: 'Browse everything',
    href: browsePath
  }
}

const toolsMenu: MegaMenu = {
  kind: 'mega',
  label: 'Tools',
  section: '/tools/',
  feature: {
    title: 'Free Japanese tools',
    description: 'Charts, lists, and converters in your browser. Nothing to install.',
    action: 'See all tools',
    symbol: 'grid',
    art: { kana: 'あいうえおかきくけこ' },
    ...linkTo('tools')
  },
  columns: [
    {
      heading: 'Reference',
      links: [
        dictionaryLink,
        {
          title: 'Kana charts',
          description: 'Hiragana and katakana',
          href: kanaChartsPath,
          mark: { symbol: 'type' }
        }
      ]
    },
    {
      heading: 'Lists',
      links: [
        {
          title: 'Kanji lists',
          description: 'Grades, JLPT, jinmeiyō',
          href: kanjiListsPath,
          mark: { symbol: 'grid' }
        },
        {
          title: 'Frequency lists',
          description: 'JLPT, YouTube, anime',
          href: frequencyDictionariesPath,
          mark: { symbol: 'chart' }
        }
      ]
    },
    {
      heading: 'Converters',
      links: [
        {
          title: 'Hiragana to Katakana',
          description: 'Convert as you type',
          mark: { symbol: 'swap' },
          ...linkTo('hiragana-to-katakana')
        },
        {
          title: 'Romaji to Kana',
          description: 'Type kana on any keyboard',
          mark: { symbol: 'type' },
          ...linkTo('romaji-to-kana')
        },
        {
          title: 'Kanji to Furigana',
          description: 'Readings above any text',
          mark: { symbol: 'book' },
          ...linkTo('kanji-to-furigana')
        }
      ]
    }
  ],
  footer: {
    note: 'Free, in your browser, from the app’s dictionary.',
    title: 'All free tools',
    ...linkTo('tools')
  }
}

export const iphoneAppTitle = 'Zenbu Japanese for iPhone'

const productsMenu: MegaMenu = {
  kind: 'mega',
  label: 'Products',
  section: '/products/',
  feature: {
    title: iphoneAppTitle,
    description: 'The dictionary, Image Search, Translate, and Player. Works offline.',
    action: 'Get the app',
    symbol: 'phone',
    art: { screenshot: '/screenshots/word-detail.webp' },
    ...linkTo('iphone-app')
  },
  columns: [
    {
      heading: 'Apps',
      links: [
        {
          title: iphoneAppTitle,
          description: 'Dictionary, Image Search, Translate, Player',
          mark: { image: '/app-icon.webp' },
          ...linkTo('iphone-app')
        },
        {
          title: 'Browser extension',
          description: 'Look up Japanese on any web page',
          mark: { symbol: 'puzzle' },
          ...linkTo('browser-extension')
        }
      ]
    },
    {
      heading: 'Free',
      links: [
        {
          title: `${site.name} Dictionary`,
          description: 'Free on the web',
          href: '/dictionary/',
          mark: { glyph: site.mark, solid: true }
        },
        {
          title: 'Free tools',
          description: 'Kana, kanji, and frequency lists',
          mark: { symbol: 'grid' },
          ...linkTo('tools')
        }
      ]
    },
    {
      heading: 'Learn',
      links: [
        {
          title: 'Reference guides',
          description: 'Printable sheets',
          mark: { symbol: 'file' },
          ...linkTo('reference-guides')
        },
        {
          title: 'Courses',
          description: 'Lessons built from real clips',
          mark: { symbol: 'play' },
          ...linkTo('courses')
        }
      ]
    }
  ],
  footer: {
    note: 'Apps, extensions, free tools, guides, and courses.',
    title: 'All products',
    ...linkTo('products')
  }
}

const companyMenu: LinkMenu = {
  kind: 'links',
  label: 'Company',
  links: (['/about/', '/sources/', '/support/', '/contact/', '/legal/'] as const).map(path =>
    pageLinkTo(path)
  )
}

export const siteMenus: readonly SiteMenu[] = [dictionaryMenu, toolsMenu, productsMenu, companyMenu]

const withSlash = (path: string) => (path.endsWith('/') ? path : `${path}/`)

export const drawerLinks = (menu: MegaMenu): MenuLink[] => [
  ...(menu.lead ? [menu.lead] : []),
  ...menu.columns.flatMap(column => column.links)
]

export function isCurrentSection(menu: SiteMenu, pathname: string): boolean {
  const path = withSlash(pathname)
  return menu.kind === 'mega'
    ? path.startsWith(menu.section)
    : menu.links.some(link => path.startsWith(link.href))
}

export const isCurrentPage = (href: string, pathname: string) => withSlash(pathname) === href
