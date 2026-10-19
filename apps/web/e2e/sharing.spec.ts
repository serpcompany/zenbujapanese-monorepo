import type { Page } from '@playwright/test'
import { characters, descriptionLength } from '../src/lib/snippets'
import { expect, needed, onPhone, test } from './test'

const sharedPages = [
  needed.path,
  `/ja${needed.path}`,
  '/dictionary/browse/hiragana/',
  '/ja/dictionary/browse/kanji/grade-4/',
  '/about/',
  '/ja/about/'
]

const content = (page: Page, selector: string) =>
  page.locator(`head ${selector}`).getAttribute('content')

test.describe('titles, descriptions, and sharing', () => {
  test.beforeEach(() => {
    test.skip(onPhone(), 'The head is the same at every width')
  })

  for (const path of sharedPages) {
    test(`${path} shares with an image and a large card, and its description fits search results`, async ({
      page
    }) => {
      await page.goto(path)
      const japanese = path.startsWith('/ja/')
      expect(await content(page, 'meta[property="og:image"]')).toMatch(/\/og-image\.png$/)
      expect(await content(page, 'meta[property="og:image:width"]')).toBe('1200')
      expect(await content(page, 'meta[property="og:image:height"]')).toBe('630')
      expect(await content(page, 'meta[property="og:type"]')).toBe('website')
      expect(await content(page, 'meta[property="og:site_name"]')).toBe('Zenbu Japanese')
      expect(await content(page, 'meta[property="og:locale"]')).toBe(japanese ? 'ja_JP' : 'en_US')
      expect(await content(page, 'meta[name="twitter:card"]')).toBe('summary_large_image')
      expect(await content(page, 'meta[name="twitter:image"]')).toMatch(/\/og-image\.png$/)
      expect(await content(page, 'meta[name="twitter:title"]')).toBe(
        await content(page, 'meta[property="og:title"]')
      )
      const description = (await content(page, 'meta[name="description"]')) ?? ''
      expect(await content(page, 'meta[property="og:description"]')).toBe(description)
      expect(await content(page, 'meta[name="twitter:description"]')).toBe(description)
      expect(characters(description), description).toBeGreaterThanOrEqual(
        descriptionLength.shortest
      )
      expect(characters(description), description).toBeLessThanOrEqual(descriptionLength.longest)
    })
  }

  test('the Open Graph image is served', async ({ request }) => {
    const response = await request.get('/og-image.png')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toBe('image/png')
  })
})
