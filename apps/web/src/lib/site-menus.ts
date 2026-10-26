import {
  browsePath,
  categoryIndexes,
  frequencyDictionariesPath,
  jlptVocabularyPath,
  kanjiListsPath,
  scriptPath
} from '@/lib/dictionary/browse/paths'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { localizedPath } from '@/lib/i18n/paths'
import { pageFor, type SitePath } from '@/lib/pages'
import {
  catalogEntry,
  featuredApp,
  type ProductWithPage,
  productTypePages
} from '@/lib/products/catalog'
import { productNameIn } from '@/lib/products/localized-catalog'
import { type LinkTargetId, type LinkTo, linkTo, localizedLink, site } from '@/lib/site'

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

type ProductTypeWithPage = keyof typeof productTypePages

export function siteMenusIn(locale: Locale): SiteMenu[] {
  const text = getDictionary(locale)
  const t = text.menus
  const page = (href: string): LinkTo => ({ href: localizedPath(href, locale) })
  const target = (id: LinkTargetId): LinkTo => localizedLink(linkTo(id), locale)
  const productPage = (id: ProductWithPage['id']) => localizedLink(catalogEntry(id).page, locale)
  const listed = (
    id: ProductWithPage['id'],
    description: string,
    mark: MenuLink['mark']
  ): MenuLink => ({
    title: productNameIn(id, locale),
    description,
    ...productPage(id),
    mark
  })
  const productType = (type: ProductTypeWithPage, mark: MenuLink['mark']): MenuLink => ({
    title: text.products.filters[type].label,
    description: t.products.lines[type],
    mark,
    ...localizedLink(productTypePages[type], locale)
  })
  const appName = text.products.featuredApp.title
  const appPage = localizedLink(featuredApp.page, locale)
  const dictionaryLink: MenuLink = {
    ...t.dictionary.link,
    ...productPage('dictionary'),
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
          listed('kana-charts', t.tools.kanaCharts.description, { symbol: 'type' })
        ]
      },
      {
        heading: t.tools.lists,
        links: [
          listed('kanji-lists', t.tools.kanjiLists.description, { symbol: 'grid' }),
          listed('frequency-lists', t.tools.frequencyLists.description, { symbol: 'chart' })
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
      title: appName,
      ...t.products.feature,
      symbol: 'phone',
      art: { screenshot: '/screenshots/word-detail.webp' },
      ...appPage
    },
    columns: [
      {
        heading: t.products.apps,
        links: [
          {
            title: appName,
            description: t.products.lines.app,
            mark: { image: '/app-icon.webp' },
            ...appPage
          },
          {
            title: productNameIn('browser-extension', locale),
            description: t.products.lines['browser-extension'],
            mark: { symbol: 'puzzle' },
            ...productPage('browser-extension')
          }
        ]
      },
      {
        heading: t.products.free,
        links: [
          listed('dictionary', t.products.lines.dictionary, { glyph: site.mark, solid: true }),
          productType('free-tools', { symbol: 'grid' })
        ]
      },
      {
        heading: t.products.learn,
        links: [
          productType('reference-guides', { symbol: 'file' }),
          productType('courses', { symbol: 'play' })
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
