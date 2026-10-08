import type { Page } from '@playwright/test'
import { pageSources } from '../src/lib/dictionary/sources'
import { exampleSearches, homeTitle, webTools } from '../src/lib/home'
import { pageFor } from '../src/lib/pages'
import { linkTo, productionOrigin, site } from '../src/lib/site'
import { expect, test } from './test'

const main = (page: Page) => page.getByRole('main')

const region = (page: Page, name: RegExp) => main(page).getByRole('region', { name })

test.describe('homepage', () => {
  test('is titled, described, shared as the site, and its own canonical URL', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(homeTitle)
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      pageFor('/').description
    )
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1)
    await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute(
      'href',
      productionOrigin
    )
    await expect(page.locator('head meta[property="og:url"]')).toHaveAttribute(
      'content',
      productionOrigin
    )
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', homeTitle)
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
      'content',
      site.name
    )
  })

  test('the hero leads with the app, with Get the app and Search the dictionary', async ({
    page
  }) => {
    await page.goto('/')
    const hero = region(page, /^Understand the Japanese you meet$/)
    await expect(hero.getByRole('heading', { level: 1 })).toHaveText(
      'Understand the Japanese you meet'
    )
    const productPage = linkTo('iphone-app')
    const getTheApp = hero.getByRole('button', { name: 'Get the app' })
    await expect(getTheApp).toHaveAttribute('href', productPage.href)
    await expect(getTheApp).toHaveAttribute('data-link-target', 'iphone-app')
    await expect(hero.getByRole('img')).toHaveCount(2)
    await expect(hero.getByText('Works offline', { exact: true })).toBeVisible()
    await hero.getByRole('link', { name: 'Search the dictionary' }).click()
    await expect(page).toHaveURL('/dictionary/')
    await expect(page.getByRole('heading', { level: 1, name: 'Japanese dictionary' })).toBeVisible()
  })

  test('the Try the dictionary box opens the search page', async ({ page }) => {
    await page.goto('/')
    const tryIt = region(page, /^Try the dictionary$/)
    await tryIt.getByRole('textbox', { name: 'Search Japanese or English' }).fill('iru')
    await tryIt.getByRole('button', { name: 'Search' }).click()
    await expect(page).toHaveURL('/dictionary/search/iru/')
    await expect(page.getByText('6 words for iru')).toBeVisible()
  })

  test('each example search opens its search page', async ({ page }) => {
    await page.goto('/')
    const examples = region(page, /^Try the dictionary$/).getByRole('list', { name: 'Try' })
    await expect(examples.getByRole('link')).toHaveText(
      exampleSearches.map(example => example.query)
    )
    for (const example of exampleSearches) {
      await expect(examples.getByRole('link', { name: example.query })).toHaveAttribute(
        'href',
        example.path
      )
    }
    await examples.getByRole('link', { name: 'taberu' }).click()
    await expect(page).toHaveURL('/dictionary/search/taberu/')
    await expect(page.getByRole('main').getByRole('textbox')).toHaveValue('taberu')
  })

  test('the free web tools link to pages the site has, with no redirect', async ({
    page,
    request
  }) => {
    await page.goto('/')
    const tools = region(page, /^Free on the web\./).getByRole('list', { name: 'Free tools' })
    const links = tools.getByRole('link')
    await expect(links).toHaveText(webTools.map(tool => new RegExp(`^${tool.title}`)))
    for (const tool of webTools) {
      const link = tools.getByRole('link', { name: new RegExp(`^${tool.title}`) })
      await expect(link).toHaveAttribute('href', tool.href)
      expect((await request.get(tool.href, { maxRedirects: 0 })).status(), tool.href).toBe(200)
    }
    await tools.getByRole('link', { name: /^Kanji lists/ }).click()
    await expect(page).toHaveURL('/dictionary/browse/kanji/')
  })

  test('the closing block credits the open data, then offers the app', async ({ page }) => {
    await page.goto('/')
    const closing = region(page, /^Your Japanese stays yours\./)
    await expect(closing.getByRole('heading', { level: 3 })).toHaveText([
      'Works offline',
      'No account, no ads',
      'Built on open data',
      'Zenbu Japanese for iPhone'
    ])
    const licences = closing.getByRole('definition')
    await expect(closing.getByRole('term')).toHaveText(pageSources.home.map(source => source.name))
    await expect(licences).toHaveText(pageSources.home.map(source => source.license.name))
    await expect(closing.getByRole('button', { name: 'Get the app' })).toHaveAttribute(
      'data-link-target',
      'iphone-app'
    )
    await expect(closing.getByRole('link', { name: 'All products' })).toHaveAttribute(
      'data-link-target',
      'products'
    )
    await closing.getByRole('link', { name: 'Sources' }).click()
    await expect(page).toHaveURL('/sources/')
  })
})
