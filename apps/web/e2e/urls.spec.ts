import { expect, needed, onProductionBuild, test } from './test'

const answeredByWorker = 'worker.ts answers it before Next.js, and next dev runs Next.js alone'

test.describe('URLs', () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'desktop',
      'A redirect or status is the same at every width'
    )
  })

  const slashedFileRedirectNote =
    'next dev strips a file URL’s slash first, in a redirect of its own, which OpenNext skips'

  for (const [from, to, onlyOnTheProductionBuild] of [
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
    ['/sitemaps/dictionary/1.xml', '/sitemap-words.xml'],
    ['/sitemaps/dictionary/2.xml', '/sitemap-words-2.xml'],
    ['/sitemap-pages.xml/', '/sitemap-pages.xml'],
    ['/sitemap.xml', '/sitemap-index.xml'],
    ['/sitemaps/pages.xml/', '/sitemap-pages.xml', slashedFileRedirectNote],
    ['/sitemaps/dictionary/2.xml/', '/sitemap-words-2.xml', slashedFileRedirectNote],
    ['/en/', '/'],
    ['/en/about/', '/about/'],
    [`/en${needed.path}`, needed.path],
    ['/en/dictionary/search/iru/', '/dictionary/search/iru/'],
    ['/en/robots.txt', '/robots.txt'],
    ['/en', '/', answeredByWorker],
    ['/en/about', '/about/', answeredByWorker]
  ] as const) {
    test(`${decodeURI(from)} redirects to ${decodeURI(to)} in one hop`, async ({
      request,
      baseURL
    }) => {
      test.skip(
        onlyOnTheProductionBuild !== undefined && !onProductionBuild,
        onlyOnTheProductionBuild
      )
      const response = await request.get(from, { maxRedirects: 0 })
      expect(response.status()).toBe(308)
      expect(new URL(response.headers().location, baseURL).pathname).toBe(to)
    })
  }

  for (const path of ['/en//evil.com', '/en//evil.com/x', '/en/%5Cevil.com']) {
    test(`${path} redirects only within the site`, async ({ request, baseURL }) => {
      const response = await request.get(path, { maxRedirects: 0 })
      const site = new URL(`${baseURL}`)
      expect(response.status()).toBe(308)
      expect(new URL(response.headers().location, site).host).toBe(site.host)
    })
  }

  for (const [path, lang] of [
    ['/', 'en'],
    ['/ja/', 'ja'],
    ['/about/', 'en'],
    ['/ja/about/', 'ja'],
    [needed.path, 'en'],
    [`/ja${needed.path}`, 'ja']
  ] as const) {
    test(`${decodeURI(path)} answers 200 in ${lang}`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 })
      expect(response.status()).toBe(200)
      expect(await response.text()).toMatch(new RegExp(`^<!DOCTYPE html><html lang="${lang}"`))
    })
  }

  test('adding Japanese changed no file: they keep their one URL, with no language prefix', async ({
    request
  }) => {
    for (const path of ['/robots.txt', '/sitemap-index.xml', '/dictionary/service.json']) {
      expect((await request.get(path, { maxRedirects: 0 })).status(), path).not.toBe(308)
    }
    for (const path of [
      '/ja/robots.txt',
      '/ja/sitemap-index.xml',
      '/ja/dictionary/examples/1546640.json?build=fixtures&from=5',
      '/ja/dictionary/search/eat/examples.json?build=fixtures&from=0'
    ]) {
      expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(404)
    }
  })

  test('/privacy, which the shipped app links to, reaches the privacy policy', async ({ page }) => {
    await page.goto('/privacy')
    await expect(page).toHaveURL('/legal/privacy/')
  })

  for (const from of ['/privacy', '/privacy/', '/privacy?from=app']) {
    test(`${from} redirects to the privacy policy in one hop`, async ({ request, baseURL }) => {
      test.skip(!onProductionBuild, answeredByWorker)
      const response = await request.get(from, { maxRedirects: 0 })
      expect(response.status()).toBe(308)
      const location = new URL(response.headers().location, baseURL)
      expect(location.pathname).toBe('/legal/privacy/')
      expect(location.search).toBe(new URL(from, baseURL).search)
    })
  }

  for (const [host, origin] of [
    ['www.zenbujapanese.com', 'https://zenbujapanese.com'],
    ['zenbujapanese-web-staging.example.workers.dev', 'https://staging.zenbujapanese.com']
  ] as const) {
    for (const [from, to] of [
      ['/about', '/about/'],
      ['/about/', '/about/'],
      ['/en/about', '/about/'],
      ['/ja/about', '/ja/about/'],
      ['/privacy', '/legal/privacy/'],
      ['/robots.txt', '/robots.txt'],
      ['/.well-known/change-password', '/.well-known/change-password']
    ] as const) {
      test(`${host}${from} reaches ${origin}${to} in one hop`, async ({ request }) => {
        test.skip(!onProductionBuild, answeredByWorker)
        const response = await request.get(from, { headers: { host }, maxRedirects: 0 })
        expect(response.status()).toBe(308)
        expect(response.headers().location).toBe(`${origin}${to}`)
      })
    }
  }

  test('a workers.dev request that carries the smoke test header is served there', async ({
    request
  }) => {
    test.skip(!onProductionBuild, answeredByWorker)
    const response = await request.get('/about/', {
      headers: { host: 'zenbujapanese-web-staging.example.workers.dev', 'x-zenbu-smoke-test': '1' },
      maxRedirects: 0
    })
    expect(response.status()).toBe(200)
  })

  for (const path of [
    '/dictionary/search/conjugations/',
    '/dictionary/search/conjugations/examples.json?build=fixtures&from=0'
  ]) {
    test(`${path} is the search's own, not a removed conjugation page`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 })
      expect(response.status()).not.toBe(308)
    })
  }

  test('/.well-known/apple-app-site-association is JSON where Apple asks, claiming dictionary links for the app', async ({
    request
  }) => {
    test.skip(!onProductionBuild, answeredByWorker)
    const response = await request.get('/.well-known/apple-app-site-association', {
      maxRedirects: 0
    })
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toBe('application/json')
    const [app] = (await response.json()).applinks.details
    expect(app.appIDs).toEqual([
      expect.stringMatching(/^[A-Z0-9]{10}\.com\.zenbujapanese\.dictionary$/)
    ])
    expect(app.components).toContainEqual({ '/': '/dictionary/*-*' })
  })

  for (const path of [
    '/dictionary/999999999/',
    '/dictionary/0/',
    '/sitemaps/kanji.xml',
    '/sitemaps/conjugations.xml',
    '/sitemaps/browse.xml',
    '/sitemap-browse.xml'
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
