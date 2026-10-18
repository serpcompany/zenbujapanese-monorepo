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

  test('the dictionary home centers its heading and box a little above the middle, the box focused', async ({
    page
  }) => {
    await page.goto('/dictionary/')
    const box = page.getByRole('textbox', { name: 'Search Japanese or English' })
    await expect(box).toBeFocused()
    const heading = await page.getByRole('heading', { level: 1 }).evaluate(element => {
      const text = document.createRange()
      text.selectNodeContents(element)
      const { x, y, width, height } = text.getBoundingClientRect()
      return { x, y, width, height }
    })
    const search = await page.getByRole('button', { name: 'Search' }).boundingBox()
    const field = await box.boundingBox()
    const main = await page.getByRole('main').boundingBox()
    const viewport = page.viewportSize()
    if (!heading || !search || !field || !main || !viewport) throw new Error('No hero')
    const middle = (heading.y + search.y + search.height) / 2
    expect(middle).toBeLessThan(viewport.height / 2)
    expect(middle).toBeGreaterThan(viewport.height * 0.3)
    const centerOfMain = main.x + main.width / 2
    expect(heading.x + heading.width / 2).toBeCloseTo(centerOfMain, -1)
    expect((field.x + search.x + search.width) / 2).toBeCloseTo(centerOfMain, -1)
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

const trailToDictionary = [
  { name: 'Home', path: '/' },
  { name: 'Dictionary', path: '/dictionary/' }
]

for (const { path, trail } of [
  { path: '/dictionary/', trail: trailToDictionary },
  {
    path: '/dictionary/search/iru/',
    trail: [...trailToDictionary, { name: 'Search: iru', path: '/dictionary/search/iru/' }]
  },
  { path: needed.path, trail: [...trailToDictionary, { name: needed.headword, path: needed.path }] }
]) {
  test(`${decodeURI(path)} carries its breadcrumb trail as BreadcrumbList structured data`, async ({
    page
  }) => {
    await page.goto(path)
    const breadcrumb = page.getByRole('navigation', { name: 'breadcrumb' })
    await expect(breadcrumb.getByRole('listitem')).toHaveText(trail.map(crumb => crumb.name))
    const canonical = await page.locator('head link[rel="canonical"]').getAttribute('href')
    const origin = new URL(canonical ?? '').origin
    const scripts = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll(found => found.map(script => JSON.parse(script.textContent ?? 'null')))
    const lists = scripts.filter(data => data?.['@type'] === 'BreadcrumbList')
    expect(lists).toHaveLength(1)
    expect(lists[0]['@context']).toBe('https://schema.org')
    expect(lists[0].itemListElement).toEqual(
      trail.map((crumb, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: crumb.name,
        item: crumb.path === '/' ? origin : new URL(crumb.path, origin).href
      }))
    )
  })
}
