import type { Page } from '@playwright/test'
import {
  featuredApp,
  productFilterPath,
  productFilters,
  products
} from '../src/lib/products/catalog'
import { expect, test } from './test'

const everyProduct = [featuredApp.title, ...products.map(product => product.title)]

const catalog = (page: Page) => page.getByRole('main')
const shownTitles = (page: Page) => catalog(page).getByRole('heading', { level: 3 })
const search = (page: Page) => page.getByRole('searchbox', { name: 'Search products' })
const filters = (page: Page) => page.getByRole('navigation', { name: 'Product types' })
const filterLink = (page: Page, label: string) =>
  filters(page).getByRole('link', { name: label, exact: true })

const titlesOfType = (type: string) => [
  ...(featuredApp.type === type ? [featuredApp.title] : []),
  ...products.filter(product => product.type === type).map(product => product.title)
]

test.describe('the products catalog', () => {
  test('lists every product, the iPhone app first, with the All filter current', async ({
    page
  }) => {
    await page.goto('/products/')
    await expect(page.getByRole('heading', { level: 1, name: 'Products' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'All products' })).toBeVisible()
    await expect(shownTitles(page)).toHaveText(everyProduct)
    await expect(filterLink(page, 'All')).toHaveAttribute('aria-current', 'page')
  })

  test('the server renders every product whichever filter the address names', async ({
    request
  }) => {
    const html = await (await request.get('/products/?type=courses')).text()
    for (const title of everyProduct) expect(html).toContain(`>${title}</h3>`)
  })

  test('each filter shows only its products, under its own heading, at its own link', async ({
    page
  }) => {
    await page.goto('/products/')
    for (const filter of productFilters.slice(1)) {
      await filterLink(page, filter.label).click()
      await expect(page).toHaveURL(productFilterPath(filter.id))
      await expect(filterLink(page, filter.label)).toHaveAttribute('aria-current', 'page')
      await expect(page.getByRole('heading', { level: 2, name: filter.title })).toBeVisible()
      await expect(shownTitles(page)).toHaveText(titlesOfType(filter.id))
    }
    await filterLink(page, 'All').click()
    await expect(page).toHaveURL(/\/products\/$/)
    await expect(shownTitles(page)).toHaveText(everyProduct)
  })

  for (const filter of productFilters.slice(1)) {
    test(`the ${filter.label} filter's link opens the catalog filtered`, async ({ page }) => {
      await page.goto(productFilterPath(filter.id))
      await expect(filterLink(page, filter.label)).toHaveAttribute('aria-current', 'page')
      await expect(filterLink(page, filter.label)).toHaveAttribute(
        'href',
        productFilterPath(filter.id)
      )
      await expect(shownTitles(page)).toHaveText(titlesOfType(filter.id))
    })
  }

  test('going back returns to the filter before', async ({ page }) => {
    await page.goto('/products/')
    await filterLink(page, 'Apps').click()
    await filterLink(page, 'Courses').click()
    await expect(shownTitles(page)).toHaveText(titlesOfType('courses'))
    await page.goBack()
    await expect(page).toHaveURL(productFilterPath('apps'))
    await expect(shownTitles(page)).toHaveText(titlesOfType('apps'))
  })

  test('search narrows the cards within the current filter', async ({ page }) => {
    await page.goto('/products/')
    await search(page).fill('pdf')
    await expect(shownTitles(page)).toHaveText([
      'Kana chart PDF',
      'Verb conjugations PDF',
      'JLPT N5 kanji PDF'
    ])
    await search(page).fill('kanji')
    await filterLink(page, 'Free tools').click()
    await expect(search(page)).toHaveValue('kanji')
    await expect(shownTitles(page)).toHaveText(['Kanji lists'])
    await search(page).fill('Translate')
    await filterLink(page, 'All').click()
    await expect(shownTitles(page)).toHaveText([featuredApp.title])
  })

  test('a search that matches nothing says so, and Clear search brings the cards back', async ({
    page
  }) => {
    await page.goto('/products/')
    await search(page).fill('zzz')
    await expect(shownTitles(page)).toHaveCount(0)
    await expect(page.getByText('No products match “zzz”.')).toBeVisible()
    await page.getByRole('button', { name: 'Clear search' }).click()
    await expect(search(page)).toHaveValue('')
    await expect(shownTitles(page)).toHaveText(everyProduct)
  })

  test('⌘K or Ctrl+K focuses the search', async ({ page }) => {
    test.skip(test.info().project.name === 'phone', 'Phones have no keyboard shortcut')
    await page.goto('/products/')
    await expect(page.getByText('⌘', { exact: true })).toBeVisible()
    for (const shortcut of ['Meta+K', 'Control+K']) {
      await page.getByRole('heading', { level: 1 }).click()
      await expect(search(page)).not.toBeFocused()
      await page.keyboard.press(shortcut)
      await expect(search(page)).toBeFocused()
    }
  })

  test('the iPhone app’s Learn more opens its page, and its Get the app is the App Store placeholder', async ({
    page
  }) => {
    await page.goto('/products/')
    const card = catalog(page).getByRole('button', { name: 'Get the app' })
    await expect(card).toHaveAttribute('href', '#')
    await expect(card).toHaveAttribute('data-link-target', 'app-store')
    await catalog(page)
      .getByRole('link', { name: `Learn more about ${featuredApp.title}` })
      .click()
    await expect(page).toHaveURL(/\/products\/zenbu-japanese-app\/$/)
  })

  test('a free tool’s card opens its page, and a coming-soon card is not a link', async ({
    page
  }) => {
    await page.goto('/products/')
    await expect(catalog(page).getByRole('link', { name: 'Browser extension' })).toHaveCount(0)
    await expect(catalog(page).getByText('Coming soon')).toHaveCount(
      products.filter(product => !product.href).length
    )
    await catalog(page).getByRole('link', { name: 'Kana charts', exact: true }).click()
    await expect(page).toHaveURL(/\/dictionary\/browse\/kana\/$/)
  })
})
