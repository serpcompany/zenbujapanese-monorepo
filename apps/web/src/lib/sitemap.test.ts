import { describe, expect, it } from 'vitest'
import { childSitemaps, sitemapIndexXml, urlSetXml } from './sitemap'

describe('sitemaps', () => {
  it('lists child sitemaps as absolute URLs', () => {
    expect(sitemapIndexXml(childSitemaps)).toContain(
      '<sitemap><loc>https://zenbujapanese.com/sitemaps/pages.xml</loc></sitemap>'
    )
  })

  it('escapes URLs and writes lastmod', () => {
    const xml = urlSetXml([
      { url: 'https://zenbujapanese.com/?a=1&b=2', lastModified: new Date('2026-09-28T00:00:00Z') }
    ])
    expect(xml).toContain('<loc>https://zenbujapanese.com/?a=1&amp;b=2</loc>')
    expect(xml).toContain('<lastmod>2026-09-28T00:00:00.000Z</lastmod>')
  })
})
