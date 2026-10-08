import { appScreenshots } from '@/lib/app-screenshots'
import {
  frequencyDictionariesPath,
  kanaChartsPath,
  kanjiListsPath
} from '@/lib/dictionary/browse/paths'
import { linkTo, site } from '@/lib/site'
import { iphoneAppTitle } from '@/lib/site-menus'

export const productsPath = '/products/'
export const productTypeParameter = 'type'

export type ProductType = 'apps' | 'extensions' | 'free-tools' | 'reference-guides' | 'courses'
export type ProductFilter = 'all' | ProductType

export const productFilters: readonly {
  id: ProductFilter
  label: string
  title: string
  description: string
}[] = [
  {
    id: 'all',
    label: 'All',
    title: 'All products',
    description: 'Apps, extensions, free tools, guides, and courses, all built on one dictionary.'
  },
  {
    id: 'apps',
    label: 'Apps',
    title: 'Apps',
    description: 'Everything Zenbu does, in your pocket.'
  },
  {
    id: 'extensions',
    label: 'Extensions',
    title: 'Extensions',
    description: 'Zenbu in your browser, on any page.'
  },
  {
    id: 'free-tools',
    label: 'Free tools',
    title: 'Free tools',
    description: 'The app’s dictionary and reference lists, free in your browser.'
  },
  {
    id: 'reference-guides',
    label: 'Reference guides',
    title: 'Reference guides',
    description: 'Printable sheets to keep beside you while you study.'
  },
  {
    id: 'courses',
    label: 'Courses',
    title: 'Courses',
    description: 'Short lessons built from real Japanese.'
  }
]

export function productFilterFrom(value: string | null | undefined): ProductFilter {
  return productFilters.find(filter => filter.id !== 'all' && filter.id === value)?.id ?? 'all'
}

export const productFilterPath = (filter: ProductFilter) =>
  filter === 'all' ? productsPath : `${productsPath}?${productTypeParameter}=${filter}`

export const productFilterFor = (filter: ProductFilter) =>
  productFilters.find(candidate => candidate.id === filter) ?? productFilters[0]

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

export interface Product {
  id: string
  type: ProductType
  title: string
  description: string
  mark: ProductMark
  facts: readonly { symbol: ProductSymbol; text: string }[]
  href?: string
}

export const featuredApp = {
  type: 'apps',
  title: iphoneAppTitle,
  tags: ['iPhone', 'Works offline'],
  description:
    'An offline Japanese dictionary with Image Search, handwriting, a live conversation translator, and YouTube with linked captions.',
  includes: [
    'Offline dictionary',
    'Image Search',
    'Handwriting',
    'Translate',
    'Player',
    'Lists and Known Words'
  ],
  icon: '/app-icon-192.webp',
  page: linkTo('iphone-app'),
  screenshots: [appScreenshots.imageSearch, appScreenshots.wordDetail]
} as const

const web = { symbol: 'globe', text: 'Web' } as const
const pdf = { symbol: 'file', text: 'PDF' } as const

export const products: readonly Product[] = [
  {
    id: 'browser-extension',
    type: 'extensions',
    title: 'Browser extension',
    description: 'Look up any Japanese word on a web page without leaving it.',
    mark: { symbol: 'puzzle' },
    facts: [{ symbol: 'globe', text: 'Browsers' }]
  },
  {
    id: 'dictionary',
    type: 'free-tools',
    title: `${site.name} Dictionary`,
    description: 'Search more than 200,000 words in Japanese, kana, romaji, or English.',
    mark: { glyph: site.mark, solid: true },
    facts: [web, { symbol: 'book', text: '200,000+ words' }],
    href: '/dictionary/'
  },
  {
    id: 'kana-charts',
    type: 'free-tools',
    title: 'Kana charts',
    description: 'Hiragana and katakana, with common words for every kana.',
    mark: { glyph: 'あ' },
    facts: [web, { symbol: 'type', text: 'Hiragana and katakana' }],
    href: kanaChartsPath
  },
  {
    id: 'kanji-lists',
    type: 'free-tools',
    title: 'Kanji lists',
    description: 'Kanji by school grade, JLPT level, and jinmeiyō.',
    mark: { glyph: '漢' },
    facts: [web, { symbol: 'grid', text: 'Grades, JLPT, jinmeiyō' }],
    href: kanjiListsPath
  },
  {
    id: 'frequency-lists',
    type: 'free-tools',
    title: 'Frequency lists',
    description: 'The most common words, from JLPT N5 to YouTube and anime.',
    mark: { symbol: 'chart' },
    facts: [web, { symbol: 'chart', text: 'JLPT, YouTube, anime' }],
    href: frequencyDictionariesPath
  },
  {
    id: 'converters',
    type: 'free-tools',
    title: 'Converters',
    description: 'Switch between hiragana, katakana, romaji, and furigana.',
    mark: { symbol: 'swap' },
    facts: [web]
  },
  {
    id: 'kana-chart-pdf',
    type: 'reference-guides',
    title: 'Kana chart PDF',
    description: 'Hiragana and katakana on one printable page, with romaji.',
    mark: { symbol: 'file' },
    facts: [pdf]
  },
  {
    id: 'verb-conjugations-pdf',
    type: 'reference-guides',
    title: 'Verb conjugations PDF',
    description: 'Every form of a verb, with what each one means.',
    mark: { symbol: 'file' },
    facts: [pdf]
  },
  {
    id: 'jlpt-n5-kanji-pdf',
    type: 'reference-guides',
    title: 'JLPT N5 kanji PDF',
    description: 'The kanji on the N5 list, with readings and stroke counts.',
    mark: { symbol: 'file' },
    facts: [pdf]
  },
  {
    id: 'real-clips-course',
    type: 'courses',
    title: 'Japanese from real clips',
    description:
      'Short video lessons built around phrases you’ll hear again, every word linked to the dictionary.',
    mark: { symbol: 'play' },
    facts: [{ symbol: 'tv', text: 'Video' }]
  }
]

export function productById(id: string): Product {
  const product = products.find(candidate => candidate.id === id)
  if (!product) throw new Error(`Unknown product: ${id}`)
  return product
}

export const productTypeLabel = (type: ProductType) => productFilterFor(type).label

const searchText = (...parts: readonly string[]) => parts.join(' ').toLowerCase()

export const featuredAppSearchText = searchText(
  featuredApp.title,
  featuredApp.description,
  ...featuredApp.tags,
  ...featuredApp.includes,
  productTypeLabel(featuredApp.type)
)

export const productSearchText = (product: Product) =>
  searchText(product.title, product.description, productTypeLabel(product.type))

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
