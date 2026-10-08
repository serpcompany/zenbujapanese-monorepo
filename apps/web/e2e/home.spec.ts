import type { Page } from '@playwright/test'
import { pageEnd } from '../src/lib/app-parts'
import { appExtras, appFeatures, exampleSearches, homeTitle, webTools } from '../src/lib/home'
import { pageFor } from '../src/lib/pages'
import { linkTo, productionOrigin, site } from '../src/lib/site'
import { expect, onPhone, sourcesToggle, test } from './test'

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

  test('shows the four features, then the four more things in the app', async ({ page }) => {
    await page.goto('/')
    await expect(
      region(page, /^One app for reading, writing, and talking$/).getByRole('heading', {
        level: 3
      })
    ).toHaveText(appFeatures.map(feature => feature.title))
    await expect(
      region(page, /^Also in the app\. For everything after the lookup\.$/).getByRole('heading', {
        level: 3
      })
    ).toHaveText(Object.values(appExtras).map(extra => extra.title))
  })

  test('tapping a kanji in 弱肉強食 moves the highlight to its part of the reading', async ({
    page
  }) => {
    await page.goto('/')
    const extras = region(page, /^Also in the app\./)
    const niku = extras.getByRole('button', { name: '肉, にく' })
    const kyou = extras.getByRole('button', { name: '強, きょう' })
    await expect(niku).toHaveAttribute('aria-pressed', 'true')
    await kyou.click()
    await expect(kyou).toHaveAttribute('aria-pressed', 'true')
    await expect(niku).toHaveAttribute('aria-pressed', 'false')
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

  test('the page ends with one card: its heading, a line, and Get the app, then the footer', async ({
    page
  }) => {
    await page.goto('/')
    await expect(main(page).getByText('Your Japanese stays yours')).toHaveCount(0)
    const end = region(page, new RegExp(`^${pageEnd.title}$`))
    await expect(end.getByRole('heading', { level: 2 })).toHaveText(pageEnd.title)
    await expect(end.getByText(pageEnd.line)).toBeVisible()
    const getTheApp = end.getByRole('button', { name: 'Get the app' })
    await expect(getTheApp).toHaveAttribute('href', linkTo('iphone-app').href)
    await expect(getTheApp).toHaveAttribute('data-link-target', 'iphone-app')
    await expect(main(page).getByRole('region').last()).toHaveAccessibleName(pageEnd.title)
    const measure = () =>
      end.getByRole('heading', { level: 2 }).evaluate(heading => {
        const box = (element: Element | null | undefined) =>
          element?.getBoundingClientRect().toJSON()
        const card = heading.parentElement?.parentElement
        return {
          card: box(card),
          collage: box(card?.lastElementChild),
          button: box(card?.querySelector('[data-link-target="iphone-app"]'))
        }
      })
    const widths = onPhone() ? [page.viewportSize()?.width ?? 0] : [768, 1280]
    for (const width of widths) {
      if (!onPhone()) await page.setViewportSize({ width, height: 900 })
      const { card, collage, button } = await measure()
      expect(button.bottom, `Get the app fits in the card at ${width} pixels`).toBeLessThanOrEqual(
        card.bottom
      )
      if (onPhone()) {
        expect(collage.bottom).toBeLessThanOrEqual(card.top + 9 * 16 + 1)
      } else {
        expect(card.height).toBeLessThanOrEqual(20 * 16)
        expect(collage.left).toBeGreaterThan(card.left + card.width / 3)
      }
    }
    await expect(sourcesToggle(page)).toHaveCount(0)
    await getTheApp.click()
    await expect(page).toHaveURL(linkTo('iphone-app').href)
  })
})
