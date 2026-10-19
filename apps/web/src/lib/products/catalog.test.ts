import { describe, expect, test } from 'vitest'
import { sitePaths } from '@/lib/pages'
import { linkTo } from '@/lib/site'
import { type ProductFilter, productFilterFrom, productFilterPath, productShown } from './catalog'
import { catalogIn } from './localized-catalog'
import { iphoneAppPageIn, iphoneAppPath } from './zenbu-japanese-for-iphone'

const { featuredApp, filters, products } = catalogIn('en')

const items = [featuredApp, ...products]

const shownFor = (filter: ProductFilter, query = '', shown = items) =>
  shown.filter(item => productShown(item, filter, query)).map(item => item.title)

describe('product filters', () => {
  test('each filter has its own link, and All is the catalog itself', () => {
    expect(filters.map(filter => productFilterPath(filter.id, 'en'))).toEqual([
      '/products/',
      '/products/?type=apps',
      '/products/?type=extensions',
      '/products/?type=free-tools',
      '/products/?type=reference-guides',
      '/products/?type=courses'
    ])
    expect(productFilterPath('apps', 'ja')).toBe('/ja/products/?type=apps')
    expect(productFilterPath('all', 'ja')).toBe('/ja/products/')
  })

  test.each([
    ['apps', 'apps'],
    ['free-tools', 'free-tools'],
    ['all', 'all'],
    ['games', 'all'],
    ['', 'all'],
    [null, 'all']
  ])('the type %s shows the %s filter', (value, filter) => {
    expect(productFilterFrom(value)).toBe(filter)
  })

  test('every filter shows at least one product, and All shows them all', () => {
    for (const filter of filters) expect(shownFor(filter.id).length).toBeGreaterThan(0)
    expect(shownFor('all')).toHaveLength(items.length)
    expect(shownFor('apps')).toEqual([featuredApp.title])
  })
})

describe('product search', () => {
  test('matches every word of the query, in any case, within the filter', () => {
    expect(shownFor('all', 'PDF')).toEqual([
      'Kana chart PDF',
      'Verb conjugations PDF',
      'JLPT N5 kanji PDF'
    ])
    expect(shownFor('all', 'kanji pdf')).toEqual(['JLPT N5 kanji PDF'])
    expect(shownFor('free-tools', 'kanji')).toEqual(['Kanji lists'])
    expect(shownFor('all', 'translate')).toEqual([featuredApp.title])
    expect(shownFor('all', 'reference guides')).toHaveLength(3)
    expect(shownFor('all', 'zzz')).toEqual([])
  })

  test('the Japanese catalog searches its Japanese text', () => {
    const japanese = catalogIn('ja')
    const shown = [japanese.featuredApp, ...japanese.products]
    expect(shownFor('all', '翻訳', shown)).toEqual([japanese.featuredApp.title])
    expect(shownFor('free-tools', '漢字リスト', shown)).toEqual(['漢字リスト'])
    expect(shownFor('all', 'pdf', shown)).toHaveLength(3)
  })
})

test('the iPhone app’s page is a site page, and the menus, footer, and catalog link to it', () => {
  expect(sitePaths).toEqual(expect.arrayContaining(['/products/', iphoneAppPath]))
  expect(linkTo('iphone-app').href).toBe(iphoneAppPath)
  expect(featuredApp.page.href).toBe(iphoneAppPath)
  expect(catalogIn('ja').featuredApp.page.href).toBe(`/ja${iphoneAppPath}`)
  expect(linkTo('products').href).toBe('/products/')
})

test('a product without a page of its own is coming soon, and the others link to the site', () => {
  expect(products.filter(product => !product.href).map(product => product.id)).toEqual([
    'browser-extension',
    'kana-chart-pdf',
    'verb-conjugations-pdf',
    'jlpt-n5-kanji-pdf',
    'real-clips-course'
  ])
  for (const product of products) {
    expect(product.badge).toBe(product.href ? 'Free' : 'Coming soon')
  }
  for (const product of products.filter(product => product.href)) {
    expect(product.href).toMatch(/^\/(dictionary\/(browse\/[a-z-]+\/)?|tools\/)$/)
  }
  for (const product of catalogIn('ja').products.filter(product => product.href)) {
    expect(product.href).toMatch(/^\/ja\/(dictionary\/(browse\/[a-z-]+\/)?|tools\/)$/)
  }
  expect(products.find(product => product.id === 'converters')?.href).toBe('/tools/')
})

test('the iPhone app’s page links its question and related products in its own language', () => {
  const english = iphoneAppPageIn('en')
  const japanese = iphoneAppPageIn('ja')
  expect(english.questions.at(-1)?.link).toEqual({
    title: 'Search the dictionary',
    href: '/dictionary/'
  })
  expect(japanese.questions.at(-1)?.link?.href).toBe('/ja/dictionary/')
  expect(japanese.related.map(product => product.id)).toEqual(
    english.related.map(product => product.id)
  )
  expect(japanese.related[0]?.href).toBe('/ja/dictionary/')
})
