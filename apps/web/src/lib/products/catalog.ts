import {
  frequencyDictionariesPath,
  kanaChartsPath,
  kanjiListsPath
} from '@/lib/dictionary/browse/paths'
import type { Locale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n/dictionary'
import { localizedPath } from '@/lib/i18n/paths'
import { type LinkTo, linkTo, placeholderHref, site } from '@/lib/site'

export const productsPath = '/products/'
export const productTypeParameter = 'type'

export type ProductType = 'apps' | 'extensions' | 'free-tools' | 'reference-guides' | 'courses'
export type ProductFilter = 'all' | ProductType

export const productFilters: readonly ProductFilter[] = [
  'all',
  'apps',
  'extensions',
  'free-tools',
  'reference-guides',
  'courses'
]

export function productFilterFrom(value: string | null | undefined): ProductFilter {
  return productFilters.find(filter => filter !== 'all' && filter === value) ?? 'all'
}

export const productFilterPath = (filter: ProductFilter, locale: Locale) =>
  localizedPath(
    filter === 'all' ? productsPath : `${productsPath}?${productTypeParameter}=${filter}`,
    locale
  )

export type ProductSymbol =
  | 'puzzle'
  | 'chart'
  | 'swap'
  | 'file'
  | 'play'
  | 'globe'
  | 'book'
  | 'type'
  | 'grid'
  | 'tv'

export type ProductMark = { glyph: string; solid?: true } | { symbol: ProductSymbol }

type ProductsText = Dictionary['products']
export type ProductId = keyof ProductsText['items']
type ProductFact = keyof ProductsText['facts']

export const productFactSymbols: Record<ProductFact, ProductSymbol> = {
  web: 'globe',
  pdf: 'file',
  browsers: 'globe',
  words: 'book',
  kana: 'type',
  kanji: 'grid',
  frequency: 'chart',
  video: 'tv'
}

interface ProductShape {
  id: ProductId
  type: ProductType
  mark: ProductMark
  facts: readonly ProductFact[]
  page?: LinkTo
}

export const featuredApp = {
  type: 'apps',
  tags: ['platform', 'offline'],
  includes: ['dictionary', 'imageSearch', 'handwriting', 'translate', 'player', 'lists'],
  icon: '/app-icon-192.webp',
  screenshots: ['imageSearch', 'wordDetail'],
  page: linkTo('iphone-app')
} as const satisfies {
  type: ProductType
  tags: readonly (keyof ProductsText['featuredApp']['tags'])[]
  includes: readonly (keyof ProductsText['featuredApp']['includes'])[]
  icon: string
  screenshots: readonly string[]
  page: LinkTo
}

const catalogEntries = [
  {
    id: 'browser-extension',
    type: 'extensions',
    mark: { symbol: 'puzzle' },
    facts: ['browsers'],
    page: linkTo('browser-extension')
  },
  {
    id: 'dictionary',
    type: 'free-tools',
    mark: { glyph: site.mark, solid: true },
    facts: ['web', 'words'],
    page: { href: '/dictionary/' }
  },
  {
    id: 'kana-charts',
    type: 'free-tools',
    mark: { glyph: 'あ' },
    facts: ['web', 'kana'],
    page: { href: kanaChartsPath }
  },
  {
    id: 'kanji-lists',
    type: 'free-tools',
    mark: { glyph: '漢' },
    facts: ['web', 'kanji'],
    page: { href: kanjiListsPath }
  },
  {
    id: 'frequency-lists',
    type: 'free-tools',
    mark: { symbol: 'chart' },
    facts: ['web', 'frequency'],
    page: { href: frequencyDictionariesPath }
  },
  {
    id: 'converters',
    type: 'free-tools',
    mark: { symbol: 'swap' },
    facts: ['web'],
    page: linkTo('tools')
  },
  { id: 'kana-chart-pdf', type: 'reference-guides', mark: { symbol: 'file' }, facts: ['pdf'] },
  {
    id: 'verb-conjugations-pdf',
    type: 'reference-guides',
    mark: { symbol: 'file' },
    facts: ['pdf']
  },
  {
    id: 'jlpt-n5-kanji-pdf',
    type: 'reference-guides',
    mark: { symbol: 'file' },
    facts: ['pdf']
  },
  { id: 'real-clips-course', type: 'courses', mark: { symbol: 'play' }, facts: ['video'] }
] as const satisfies readonly ProductShape[]

export const products: readonly ProductShape[] = catalogEntries

type CatalogEntry = (typeof catalogEntries)[number]

export type ProductWithPage = Extract<CatalogEntry, { page: LinkTo }>

export function catalogEntry<Id extends ProductWithPage['id']>(id: Id) {
  const entry = catalogEntries.find(
    (candidate): candidate is Extract<ProductWithPage, { id: Id }> => candidate.id === id
  )
  if (!entry) throw new Error(`Unknown product: ${id}`)
  return entry
}

export const productTypePages = {
  'free-tools': linkTo('tools'),
  'reference-guides': linkTo('reference-guides'),
  courses: linkTo('courses')
} as const satisfies Partial<Record<ProductType, LinkTo>>

export const livePage = (page: LinkTo | undefined) =>
  page && page.href !== placeholderHref ? page : undefined

export function productShown(
  item: { type: ProductType; searchText: string },
  filter: ProductFilter,
  query: string
): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return (
    (filter === 'all' || item.type === filter) &&
    words.every(word => item.searchText.includes(word))
  )
}
