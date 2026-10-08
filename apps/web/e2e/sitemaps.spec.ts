import { pagesSitemapPaths } from '../src/lib/pages-sitemap'
import { expect, test } from './test'

const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1])

test.describe('sitemaps', () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'A sitemap is the same at every width')
  })

  test('robots.txt lists the sitemap index where the site is served', async ({
    request,
    baseURL
  }) => {
    const robots = await (await request.get('/robots.txt')).text()
    expect(robots).toContain(`\nSitemap: ${new URL(baseURL ?? '').origin}/sitemap-index.xml\n`)
  })

  for (const index of ['/sitemap-index.xml']) {
    test(`${index} lists sitemap-<group>.xml files at the root of this origin`, async ({
      request,
      baseURL
    }) => {
      const response = await request.get(index)
      expect(response.status()).toBe(200)
      const origin = new URL(baseURL ?? '').origin
      const listed = locs(await response.text())
      expect(listed).toContain(`${origin}/sitemap-pages.xml`)
      for (const url of listed)
        expect(url).toMatch(new RegExp(`^${origin}/sitemap-[a-z]+(-[a-z]+)*(-[0-9]+)?\\.xml$`))
    })
  }

  test('the pages sitemap writes the homepage as the origin and every other page with its slash', async ({
    request,
    baseURL
  }) => {
    const origin = new URL(baseURL ?? '').origin
    const listed = locs(await (await request.get('/sitemap-pages.xml')).text())
    expect(listed).toEqual(
      pagesSitemapPaths.map(path => (path === '/' ? origin : `${origin}${path}`))
    )
  })
})
