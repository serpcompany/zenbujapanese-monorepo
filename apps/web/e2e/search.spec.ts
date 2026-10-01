import { expect, needed, searchOrder, test } from './test'

test.describe('search', () => {
  test('the dictionary home searches and lands on the canonical results page', async ({ page }) => {
    await page.goto('/dictionary/')
    await expect(page.getByRole('heading', { level: 1, name: 'Japanese dictionary' })).toBeVisible()
    await page.getByRole('textbox', { name: 'Search Japanese or English' }).fill('  IRU ')
    await page.getByRole('button', { name: 'Search' }).click()
    await expect(page).toHaveURL('/dictionary/search/iru/')
    await expect(page).toHaveTitle('iru in Japanese | Zenbu Japanese')
    await expect(page.getByText('6 words for iru')).toBeVisible()
    await expect(
      page.getByRole('main').getByRole('textbox', { name: 'Search Japanese or English' })
    ).toHaveValue('iru')
  })

  for (const query of ['iru', 'いる', '要']) {
    test(`lists ${query}'s words in the app's order`, async ({ page }) => {
      await page.goto(`/dictionary/search/${encodeURIComponent(query)}/`)
      const hrefs = await page
        .getByRole('main')
        .getByRole('link')
        .evaluateAll(links => links.map(link => link.getAttribute('href') ?? ''))
      expect(hrefs.filter(href => /^\/dictionary\/[^/]+-\d+\/$/.test(href))).toEqual(
        searchOrder(query).map(word => decodeURI(word.path))
      )
    })
  }

  test('opens a word from its result row', async ({ page }) => {
    await page.goto('/dictionary/search/iru/')
    await page.getByRole('link', { name: /^要 い る to be needed/ }).click()
    await expect(page).toHaveURL(needed.path)
    await expect(page.getByRole('heading', { level: 1, name: needed.headword })).toBeVisible()
  })

  test('says so when nothing matches', async ({ page }) => {
    await page.goto('/dictionary/search/zzzzqqq/')
    await expect(page.getByRole('main')).toContainText('zzzzqqq')
    await expect(page.getByRole('main').getByRole('link', { name: /^要 い る/ })).toHaveCount(0)
  })
})
