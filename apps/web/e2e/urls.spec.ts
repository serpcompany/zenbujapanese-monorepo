import { expect, needed, onProductionBuild, test } from './test'

test.describe('URLs', () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'desktop',
      'A redirect or status is the same at every width'
    )
  })

  const slashedFileRedirectNote =
    'next dev strips a file URL’s slash first, in a redirect of its own, which OpenNext skips'

  for (const [from, to, productionBuildOnly] of [
    ['/dictionary/1546640/', needed.path],
    [encodeURI('/dictionary/要らない-1546640/'), needed.path],
    ['/dictionary/search/IRU/', '/dictionary/search/iru/'],
    [encodeURI('/dictionary/kanji/要/'), encodeURI('/dictionary/search/要/')],
    [`${needed.path}conjugations/`, needed.path],
    [`${needed.path}conjugations/plain/past/`, needed.path],
    [`${needed.path}conjugations/polite/te-form/`, needed.path],
    ['/dictionary/search/iru/examples/', '/dictionary/search/iru/'],
    ['/support', '/support/'],
    ['/robots.txt/', '/robots.txt'],
    ['/sitemaps/pages.xml', '/sitemap-pages.xml'],
    ['/sitemaps/browse.xml', '/sitemap-browse.xml'],
    ['/sitemaps/dictionary/1.xml', '/sitemap-words.xml'],
    ['/sitemaps/dictionary/2.xml', '/sitemap-words-2.xml'],
    ['/sitemap-pages.xml/', '/sitemap-pages.xml'],
    ['/sitemaps/pages.xml/', '/sitemap-pages.xml', true],
    ['/sitemaps/dictionary/2.xml/', '/sitemap-words-2.xml', true]
  ] as const) {
    test(`${decodeURI(from)} redirects to ${decodeURI(to)} in one hop`, async ({
      request,
      baseURL
    }) => {
      test.skip(Boolean(productionBuildOnly) && !onProductionBuild, slashedFileRedirectNote)
      const response = await request.get(from, { maxRedirects: 0 })
      expect(response.status()).toBe(308)
      expect(new URL(response.headers().location, baseURL).pathname).toBe(to)
    })
  }

  test('/privacy, which the shipped app links to, reaches the privacy policy', async ({ page }) => {
    await page.goto('/privacy')
    await expect(page).toHaveURL('/legal/privacy/')
  })

  for (const from of ['/privacy', '/privacy/', '/privacy?from=app']) {
    test(`${from} redirects to the privacy policy in one hop`, async ({ request, baseURL }) => {
      test.skip(
        !onProductionBuild,
        'worker.ts answers it before Next.js, and next dev runs Next.js alone'
      )
      const response = await request.get(from, { maxRedirects: 0 })
      expect(response.status()).toBe(308)
      const location = new URL(response.headers().location, baseURL)
      expect(location.pathname).toBe('/legal/privacy/')
      expect(location.search).toBe(new URL(from, baseURL).search)
    })
  }

  for (const path of [
    '/dictionary/search/conjugations/',
    '/dictionary/search/conjugations/examples.json?build=fixtures&from=0'
  ]) {
    test(`${path} is the search's own, not a removed conjugation page`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 })
      expect(response.status()).not.toBe(308)
    })
  }

  for (const path of [
    '/dictionary/999999999/',
    '/dictionary/0/',
    '/sitemaps/kanji.xml',
    '/sitemaps/conjugations.xml'
  ]) {
    test(`${decodeURI(path)} is 404`, async ({ request }) => {
      expect((await request.get(path, { maxRedirects: 0 })).status()).toBe(404)
    })
  }

  test.describe('a missing page', () => {
    test.use({ allowedConsoleErrors: [/status of 404/] })

    test('shows the not-found page with a way back to the dictionary', async ({ page }) => {
      const response = await page.goto('/dictionary/999999999/')
      expect(response?.status()).toBe(404)
      await expect(page.getByRole('link', { name: 'Dictionary' }).first()).toBeVisible()
    })
  })
})
