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

  test("a long query's crumb is cut short, never Home or Dictionary", async ({ page }) => {
    await page.goto(encodeURI(`/dictionary/search/${'とりあつかいせつめいしょ'.repeat(4)}/`))
    const breadcrumb = page.getByRole('navigation', { name: 'breadcrumb' })
    for (const name of ['Home', 'Dictionary']) {
      const overflow = await breadcrumb
        .getByRole('link', { name, exact: true })
        .evaluate(link => link.scrollWidth - (link.parentElement?.clientWidth ?? 0))
      expect(overflow, `${name} spills out of its crumb`).toBeLessThanOrEqual(0)
    }
    const query = breadcrumb.locator('[aria-current="page"]')
    expect(await query.evaluate(crumb => crumb.scrollWidth > crumb.clientWidth)).toBe(true)
  })
})

const columnWidth = 768

for (const path of [
  '/dictionary/',
  '/dictionary/search/',
  '/dictionary/search/iru/',
  needed.path
]) {
  test(`${decodeURI(path)} is one column, at most ${columnWidth} pixels wide`, async ({ page }) => {
    await page.goto(path)
    const main = await page.getByRole('main').boundingBox()
    const viewport = page.viewportSize()
    if (!main || !viewport) throw new Error('The page has no main column')
    expect(main.width).toBeCloseTo(Math.min(columnWidth, viewport.width), 0)
  })
}
