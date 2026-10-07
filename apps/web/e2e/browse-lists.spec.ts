import type { Page } from '@playwright/test'
import { expect, sourcesToggle, test } from './test'

const browse = (path = '') => `/dictionary/browse/${path}`
const robots = (page: Page) => page.locator('meta[name="robots"]')

test.describe('category lists', () => {
  test('a category lists its words most used first, a page at a time, with a tab for kana order', async ({
    page
  }) => {
    await page.goto(browse('parts-of-speech/'))
    await page.getByRole('link', { name: /^Ichidan verbs/ }).click()
    await expect(page).toHaveURL(browse('ichidan-verbs/'))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Japanese ichidan verbs')
    const main = page.getByRole('main')
    await expect(main).toContainText('most used on YouTube first')
    await expect(main).toContainText('Ichidan verbs end in る after an i or e sound')
    await expect(robots(page)).toHaveCount(0)
    const order = page.getByRole('navigation', { name: 'Order' })
    await expect(order.getByText('Most used')).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('[data-section="words"]')).toContainText('てる')
    await page
      .getByRole('navigation', { name: 'Pages' })
      .getByRole('link', { name: '2', exact: true })
      .click()
    await expect(page).toHaveURL(browse('ichidan-verbs/2/'))
    await expect(page).toHaveTitle('Japanese ichidan verbs, page 2 | Zenbu Japanese')
    await order.getByRole('link', { name: 'Kana order' }).click()
    await expect(page).toHaveURL(browse('ichidan-verbs/kana-order/'))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Japanese ichidan verbs')
    await expect(page).toHaveTitle('Japanese ichidan verbs, kana order | Zenbu Japanese')
    await expect(main).toContainText('in kana order')
    await expect(robots(page)).toHaveAttribute('content', 'noindex, follow')
    await expect(order.getByText('Kana order')).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('[data-section="words"] [data-result-row]').first()).toContainText(
      'to be compatible (with)'
    )
  })

  test('a list of under 10 words isn’t indexed, but stays linked', async ({ page }) => {
    await page.goto(browse('subjects/'))
    await page.getByRole('link', { name: /^Audiovisual/ }).click()
    await expect(page).toHaveURL(browse('audiovisual/'))
    await expect(robots(page)).toHaveAttribute('content', 'noindex, follow')
    const rows = page.locator('[data-section="words"] [data-result-row]')
    await expect(rows).toHaveCount(1)
    await expect(rows).toContainText('total harmonic distortion')
  })
})

test.describe('frequency dictionaries', () => {
  test('lead to each list’s first band and each JLPT level, with the app’s four tiers', async ({
    page
  }) => {
    await page.goto(browse('frequency-dictionaries/'))
    for (const name of ['YouTube', 'Wikipedia', 'TV and movies', 'Anime', 'Video games']) {
      await expect(page.getByRole('heading', { level: 2, name })).toBeVisible()
    }
    await expect(page.getByRole('list', { name: 'Tiers' }).getByRole('listitem')).toHaveText([
      'Very common',
      'Common',
      'Less common',
      'Uncommon'
    ])
    await expect(page.getByRole('main')).toContainText('less common to rank 15,000')
    await expect(page.getByRole('link', { name: /^N5/ })).toHaveAttribute(
      'href',
      browse('frequency-dictionaries/jlpt/n5/')
    )
    await expect(
      page.getByRole('navigation', { name: 'YouTube ranks' }).getByRole('link', { name: '1k–2k' })
    ).toHaveAttribute('href', browse('frequency-dictionaries/youtube/1001-2000/'))
    await page.getByRole('heading', { level: 2, name: 'Anime' }).getByRole('link').click()
    await expect(page).toHaveURL(browse('frequency-dictionaries/anime/1-1000/'))
  })

  test('a ranked list shows a band of 1,000 ranks, says which words it skips, and credits Jiten', async ({
    page
  }) => {
    await page.goto(browse('frequency-dictionaries/anime/1-1000/'))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Most used Japanese words: Anime'
    )
    await expect(page).toHaveTitle(
      'Most used Japanese words: Anime, ranks 1–1,000 | Zenbu Japanese'
    )
    const main = page.getByRole('main')
    await expect(main).toContainText('Ranks 1–1,000')
    await expect(main).toContainText('such as に, は, and が, aren’t ranked')
    const bands = page.getByRole('navigation', { name: 'Anime ranks' })
    await expect(bands.getByText('1–1k', { exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(bands.getByRole('link', { name: '9k–10k' })).toHaveAttribute(
      'href',
      browse('frequency-dictionaries/anime/9001-10000/')
    )
    await expect(
      main
        .locator('[data-section="words"]')
        .getByText(/^#\d+$/)
        .first()
    ).toBeVisible()
    await sourcesToggle(page).click()
    await expect(main.getByRole('link', { name: 'Jiten' })).toBeVisible()
    await expect(main).toContainText('CC BY-SA 4.0')
    await expect(main).toContainText('shared under the same licence')
  })

  test('a JLPT level lists its words in kana order', async ({ page }) => {
    await page.goto(browse('frequency-dictionaries/jlpt/n5/'))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('JLPT N5 vocabulary')
    await expect(page.getByRole('main')).toContainText('in kana order, page 1 of')
    await expect(
      page.getByRole('navigation', { name: 'Pages' }).getByRole('link', { name: '2', exact: true })
    ).toHaveAttribute('href', browse('frequency-dictionaries/jlpt/n5/2/'))
  })
})
