import {
  browsePath,
  categoryIndexes,
  frequencyDictionariesPath,
  jlptVocabularyPath,
  kanaChartsPath,
  kanjiListsPath,
  scriptPath
} from '@/lib/dictionary/browse/paths'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { fill } from '@/lib/i18n/format'
import { localizedPath } from '@/lib/i18n/paths'
import { withoutDefaultLocale } from '@/lib/i18n/routing'
import { pageFor, type SitePath } from '@/lib/pages'
import { type LinkTargetId, type LinkTo, linkTo, site } from '@/lib/site'

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

type MenuId = 'dictionary' | 'tools' | 'products' | 'company'

export type MegaMenu = {
  kind: 'mega'
  id: MenuId
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
  id: MenuId
  label: string
  links: { title: string; href: string }[]
}

export type SiteMenu = MegaMenu | LinkMenu

export function pageLinkTo(path: SitePath, locale: Locale, title = pageFor(path, locale).title) {
  return { title, href: localizedPath(path, locale) }
}

export function siteMenusIn(locale: Locale): SiteMenu[] {
  const t = getDictionary(locale).menus
  const page = (href: string): LinkTo => ({ href: localizedPath(href, locale) })
  const target = (id: LinkTargetId): LinkTo => {
    const link = linkTo(id)
    return { ...link, href: localizedPath(link.href, locale) }
  }
  const dictionaryLink: MenuLink = {
    ...t.dictionary.link,
    ...page('/dictionary/'),
    mark: { symbol: 'search' }
  }
  const dictionaryMenu: MegaMenu = {
    kind: 'mega',
    id: 'dictionary',
    label: t.dictionary.label,
    section: localizedPath('/dictionary/', locale),
    lead: { ...t.dictionary.lead, ...page('/dictionary/'), mark: { symbol: 'search' } },
    feature: {
      ...t.dictionary.feature,
      symbol: 'search',
      art: { screenshot: '/screenshots/search-results.webp' },
      ...page('/dictionary/')
    },
    columns: [
      {
        heading: t.dictionary.kana,
        links: [
          { ...t.dictionary.hiragana, ...page(scriptPath('hiragana')), mark: { glyph: 'あ' } },
          { ...t.dictionary.katakana, ...page(scriptPath('katakana')), mark: { glyph: 'ア' } }
        ]
      },
      {
        heading: t.dictionary.wordLists,
        links: [
          { ...t.dictionary.jlpt, ...page(jlptVocabularyPath(5)), mark: { symbol: 'chart' } },
          {
            ...t.dictionary.frequency,
            ...page(frequencyDictionariesPath),
            mark: { symbol: 'list' }
          }
        ]
      },
      {
        heading: t.dictionary.kanjiAndGrammar,
        links: [
          { ...t.dictionary.kanjiByGrade, ...page(kanjiListsPath), mark: { glyph: '漢' } },
          {
            ...t.dictionary.partsOfSpeech,
            ...page(categoryIndexes.partOfSpeech.path),
            mark: { symbol: 'tag' }
          }
        ]
      }
    ],
    footer: { ...t.dictionary.footer, ...page(browsePath) }
  }
  const toolsMenu: MegaMenu = {
    kind: 'mega',
    id: 'tools',
    label: t.tools.label,
    section: localizedPath('/tools/', locale),
    feature: {
      ...t.tools.feature,
      symbol: 'grid',
      art: { kana: 'あいうえおかきくけこ' },
      ...target('tools')
    },
    columns: [
      {
        heading: t.tools.reference,
        links: [
          dictionaryLink,
          { ...t.tools.kanaCharts, ...page(kanaChartsPath), mark: { symbol: 'type' } }
        ]
      },
      {
        heading: t.tools.lists,
        links: [
          { ...t.tools.kanjiLists, ...page(kanjiListsPath), mark: { symbol: 'grid' } },
          {
            ...t.tools.frequencyLists,
            ...page(frequencyDictionariesPath),
            mark: { symbol: 'chart' }
          }
        ]
      },
      {
        heading: t.tools.converters,
        links: [
          {
            ...t.tools.hiraganaToKatakana,
            mark: { symbol: 'swap' },
            ...target('hiragana-to-katakana')
          },
          { ...t.tools.romajiToKana, mark: { symbol: 'type' }, ...target('romaji-to-kana') },
          { ...t.tools.kanjiToFurigana, mark: { symbol: 'book' }, ...target('kanji-to-furigana') }
        ]
      }
    ],
    footer: { ...t.tools.footer, ...target('tools') }
  }
  const productsMenu: MegaMenu = {
    kind: 'mega',
    id: 'products',
    label: t.products.label,
    section: localizedPath('/products/', locale),
    feature: {
      title: t.iphoneApp,
      ...t.products.feature,
      symbol: 'phone',
      art: { screenshot: '/screenshots/word-detail.webp' },
      ...target('iphone-app')
    },
    columns: [
      {
        heading: t.products.apps,
        links: [
          {
            title: t.iphoneApp,
            ...t.products.iphoneApp,
            mark: { image: '/app-icon.webp' },
            ...target('iphone-app')
          },
          {
            ...t.products.browserExtension,
            mark: { symbol: 'puzzle' },
            ...target('browser-extension')
          }
        ]
      },
      {
        heading: t.products.free,
        links: [
          {
            title: fill(t.products.dictionary.title, { name: site.name }),
            description: t.products.dictionary.description,
            ...page('/dictionary/'),
            mark: { glyph: site.mark, solid: true }
          },
          { ...t.products.freeTools, mark: { symbol: 'grid' }, ...target('tools') }
        ]
      },
      {
        heading: t.products.learn,
        links: [
          {
            ...t.products.referenceGuides,
            mark: { symbol: 'file' },
            ...target('reference-guides')
          },
          { ...t.products.courses, mark: { symbol: 'play' }, ...target('courses') }
        ]
      }
    ],
    footer: { ...t.products.footer, ...target('products') }
  }
  const companyMenu: LinkMenu = {
    kind: 'links',
    id: 'company',
    label: t.company.label,
    links: (['/about/', '/sources/', '/support/', '/contact/', '/legal/'] as const).map(path =>
      pageLinkTo(path, locale)
    )
  }
  return [dictionaryMenu, toolsMenu, productsMenu, companyMenu]
}

const withSlash = (path: string) => (path.endsWith('/') ? path : `${path}/`)

const publicPath = (pathname: string) => withSlash(withoutDefaultLocale(pathname) ?? pathname)

export const drawerLinks = (menu: MegaMenu): MenuLink[] => [
  ...(menu.lead ? [menu.lead] : []),
  ...menu.columns.flatMap(column => column.links)
]

export function isCurrentSection(menu: SiteMenu, pathname: string): boolean {
  const path = publicPath(pathname)
  return menu.kind === 'mega'
    ? path.startsWith(menu.section)
    : menu.links.some(link => path.startsWith(link.href))
}

export const isCurrentPage = (href: string, pathname: string) => publicPath(pathname) === href
