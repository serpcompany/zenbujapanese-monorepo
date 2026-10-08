import type { Locator, Page } from '@playwright/test'
import { pageFor } from '../src/lib/pages'
import { pagesSitemapPaths } from '../src/lib/pages-sitemap'
import { iphoneAppPage } from '../src/lib/products/zenbu-japanese-for-iphone'
import { expect, needed, test } from './test'

const path = iphoneAppPage.path
const demos = iphoneAppPage.demos
const screenshots = iphoneAppPage.screenshots

const demo = (page: Page) => page.getByRole('region', { name: 'Features' })
const shownDemo = (page: Page) => demo(page).getByRole('heading', { level: 3 })
const count = (page: Page) => demo(page).getByText(/^\d+ \/ \d+$/)
const gallery = (page: Page) => page.getByRole('region', { name: 'See it in action.' })

async function inView(slide: Locator) {
  const [box, frame] = await Promise.all([
    slide.getByRole('figure').boundingBox(),
    slide.locator('xpath=ancestor::*[@data-slot="carousel-content"]').boundingBox()
  ])
  return Boolean(
    box && frame && box.x >= frame.x - 1 && box.x + box.width <= frame.x + frame.width + 1
  )
}

test.describe('the Zenbu Japanese for iPhone page', () => {
  test('leads with the app, its Get the app button to the App Store placeholder, and the facts', async ({
    page
  }) => {
    await page.goto(path)
    const main = page.getByRole('main')
    await expect(main.getByRole('navigation', { name: 'breadcrumb' })).toContainText(
      `Products${iphoneAppPage.title}`
    )
    await expect(main.getByRole('heading', { level: 1, name: iphoneAppPage.name })).toBeVisible()
    const getApp = main.getByRole('button', { name: 'Get the app' })
    await expect(getApp).toHaveAttribute('href', '#')
    await expect(getApp).toHaveAttribute('data-link-target', 'app-store')
    const facts = main.locator('dt')
    await expect(facts.first()).toHaveText('Platform')
    expect(['Platform', 'Platform,Requires,Version']).toContain(
      (await facts.allTextContents()).join()
    )
  })

  test('the header’s Get the app opens this page', async ({ page }) => {
    await page.goto('/about/')
    if (test.info().project.name === 'phone') {
      await page.getByRole('banner').getByRole('button', { name: 'Menu' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Get the app' }).click()
    } else {
      await page.getByRole('banner').getByRole('button', { name: 'Get the app' }).click()
    }
    await expect(page).toHaveURL(new RegExp(`${path}$`))
  })

  test('the demo shows one feature at a time, and its arrows step through them', async ({
    page
  }) => {
    await page.goto(path)
    await expect(shownDemo(page)).toHaveText([demos[0].title])
    await expect(count(page)).toHaveText(`1 / ${demos.length}`)
    const next = demo(page).getByRole('button', { name: 'Next feature' })
    const previous = demo(page).getByRole('button', { name: 'Previous feature' })
    for (const [index, feature] of demos.entries()) {
      if (index === 0) continue
      await next.click()
      await expect(shownDemo(page)).toHaveText([feature.title])
      await expect(count(page)).toHaveText(`${index + 1} / ${demos.length}`)
      await expect(demo(page).getByRole('img', { name: feature.screenshot.alt })).toBeVisible()
    }
    await next.click()
    await expect(shownDemo(page)).toHaveText([demos[0].title])
    await previous.click()
    await expect(shownDemo(page)).toHaveText([demos[demos.length - 1].title])
    await expect(count(page)).toHaveText(`${demos.length} / ${demos.length}`)
  })

  test('each of the demo’s dots opens its feature and marks itself current', async ({ page }) => {
    await page.goto(path)
    await expect(demo(page).getByRole('button', { name: 'Next feature' })).toBeEnabled()
    const dots = demo(page).getByRole('button', {
      name: new RegExp(`^(${demos.map(item => item.label).join('|')})$`)
    })
    await expect(dots).toHaveCount(demos.length)
    for (const [index, feature] of [...demos.entries()].reverse()) {
      await dots.nth(index).click()
      await expect(dots.nth(index)).toHaveAttribute('aria-current', 'true')
      await expect(shownDemo(page)).toHaveText([feature.title])
      await expect(count(page)).toHaveText(`${index + 1} / ${demos.length}`)
    }
  })

  test('the screenshot carousel scrolls with its arrows, from the first screenshot to the last', async ({
    page
  }) => {
    await page.goto(path)
    const previous = gallery(page).getByRole('button', { name: 'Previous screenshots' })
    const next = gallery(page).getByRole('button', { name: 'Next screenshots' })
    const slides = gallery(page).getByRole('group')
    await expect(slides).toHaveCount(screenshots.length)
    await expect(slides.first()).toContainText(screenshots[0].caption)
    await expect(previous).toBeDisabled()
    await expect(next).toBeEnabled()
    expect(await inView(slides.last())).toBe(false)
    while (await next.isEnabled()) await next.click()
    await expect.poll(() => inView(slides.last())).toBe(true)
    await expect(previous).toBeEnabled()
    await expect.poll(() => inView(slides.first())).toBe(false)
    while (await previous.isEnabled()) await previous.click()
    await expect.poll(() => inView(slides.first())).toBe(true)
    await expect(next).toBeEnabled()
  })

  test('lists what’s inside and the questions, the first one open', async ({ page }) => {
    await page.goto(path)
    const main = page.getByRole('main')
    for (const point of iphoneAppPage.features) {
      await expect(
        main.getByRole('heading', { level: 3, name: point.title, exact: true }).first()
      ).toBeVisible()
    }
    const questions = main.getByRole('button', { name: /\?$/ })
    await expect(questions).toHaveText(iphoneAppPage.questions.map(item => item.question))
    await expect(questions.first()).toHaveAttribute('aria-expanded', 'true')
    await expect(main.getByText(iphoneAppPage.questions[0].answer)).toBeVisible()
    const last = iphoneAppPage.questions[iphoneAppPage.questions.length - 1]
    await expect(questions.last()).toHaveAttribute('aria-expanded', 'false')
    await questions.last().click()
    await expect(main.getByText(last.answer)).toBeVisible()
    await main.getByRole('link', { name: 'Search the dictionary' }).click()
    await expect(page).toHaveURL(/\/dictionary\/$/)
  })

  test('with no videos yet, the page has no Watch it work and no Watch demo, and asks YouTube for nothing', async ({
    page
  }) => {
    const youtube: string[] = []
    page.on('request', request => {
      if (/youtube|ytimg|googlevideo/.test(request.url())) youtube.push(request.url())
    })
    await page.goto(path)
    const main = page.getByRole('main')
    await expect(main.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(main.getByRole('heading', { name: 'Watch it work.' })).toHaveCount(0)
    await expect(main.getByRole('link', { name: 'Watch demo' })).toHaveCount(0)
    await expect(main.getByRole('link', { name: /See all videos/ })).toHaveCount(0)
    await page.getByRole('contentinfo').scrollIntoViewIfNeeded()
    expect(youtube).toEqual([])
  })

  test('More from Zenbu leads to the other products and the catalog', async ({ page }) => {
    await page.goto(path)
    const main = page.getByRole('main')
    for (const product of iphoneAppPage.related) {
      await expect(main.getByRole('heading', { level: 3, name: product.title })).toBeVisible()
    }
    await main.getByRole('link', { name: 'All products' }).click()
    await expect(page).toHaveURL(/\/products\/$/)
  })
})

test.describe('the products pages’ metadata', () => {
  for (const [url, canonical, title] of [
    ['/products/', '/products/', 'Products | Zenbu Japanese'],
    ['/products/?type=free-tools', '/products/', 'Products | Zenbu Japanese'],
    [path, path, `${iphoneAppPage.title}: Japanese Dictionary & Translator`]
  ] as const) {
    test(`${url} has its title, description, and canonical URL`, async ({ page }) => {
      await page.goto(url)
      await expect(page).toHaveTitle(title)
      await expect(page.locator('meta[name="description"]')).toHaveAttribute(
        'content',
        pageFor(canonical).description
      )
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `https://zenbujapanese.com${canonical}`
      )
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
        'content',
        title.replace(' | Zenbu Japanese', '')
      )
      await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
        'content',
        'Zenbu Japanese'
      )
    })
  }
})

test.describe('the app page’s old address', () => {
  const oldAddress = '/products/zenbu-japanese-for-iphone'

  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'desktop',
      'A status and a page’s HTML are the same at every width'
    )
  })

  test(`${oldAddress}/ is 404`, async ({ request }) => {
    expect((await request.get(`${oldAddress}/`, { maxRedirects: 0 })).status()).toBe(404)
  })

  test('no page links to it', async ({ request }) => {
    test.setTimeout(120_000)
    const pages = [...pagesSitemapPaths, '/dictionary/search/iru/', needed.path]
    const responses = await Promise.all(pages.map(url => request.get(url)))
    for (const [index, response] of responses.entries()) {
      expect(response.status(), pages[index]).toBe(200)
      expect(await response.text(), pages[index]).not.toContain(oldAddress)
    }
  })
})
