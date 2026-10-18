import { describe, expect, test } from 'vitest'
import { sitePages } from '@/lib/pages'
import { linkTo } from '@/lib/site'
import {
  featuredApp,
  featuredAppSearchText,
  productById,
  productFilterFrom,
  productFilterPath,
  productFilters,
  productSearchText,
  productShown,
  products
} from './catalog'
import { iphoneAppPage } from './zenbu-japanese-for-iphone'

const items = [
  { title: featuredApp.title, type: featuredApp.type, searchText: featuredAppSearchText },
  ...products.map(product => ({
    title: product.title,
    type: product.type,
    searchText: productSearchText(product)
  }))
]

const shownFor = (filter: Parameters<typeof productShown>[1], query = '') =>
  items.filter(item => productShown(item, filter, query)).map(item => item.title)

describe('product filters', () => {
  test('each filter has its own link, and All is the catalog itself', () => {
    expect(productFilters.map(filter => productFilterPath(filter.id))).toEqual([
      '/products/',
      '/products/?type=apps',
      '/products/?type=extensions',
      '/products/?type=free-tools',
      '/products/?type=reference-guides',
      '/products/?type=courses'
    ])
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
    for (const filter of productFilters) expect(shownFor(filter.id).length).toBeGreaterThan(0)
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
})

test('the iPhone app’s page is a site page, and the menus, footer, and catalog link to it', () => {
  expect(sitePages.map(page => page.path)).toEqual(
    expect.arrayContaining(['/products/', iphoneAppPage.path])
  )
  expect(linkTo('iphone-app').href).toBe(iphoneAppPage.path)
  expect(featuredApp.page.href).toBe(iphoneAppPage.path)
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
  for (const product of products.filter(product => product.href)) {
    expect(product.href).toMatch(/^\/(dictionary\/(browse\/[a-z-]+\/)?|tools\/)$/)
  }
  expect(productById('converters').href).toBe('/tools/')
})
