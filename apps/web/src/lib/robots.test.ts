import { afterEach, describe, expect, test, vi } from 'vitest'
import { robotsTxt } from './robots'

const request = new Request('http://localhost:3100/robots.txt')

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('robots.txt', () => {
  test('production allows crawling and lists its sitemap index', () => {
    vi.stubEnv('SITE_ENV', 'production')
    expect(robotsTxt(request)).toBe(
      'User-Agent: *\nAllow: /\n\nSitemap: https://zenbujapanese.com/sitemap-index.xml\n'
    )
  })

  test('staging disallows crawling and lists its own sitemap index', () => {
    vi.stubEnv('SITE_ENV', 'staging')
    expect(robotsTxt(request)).toBe(
      'User-Agent: *\nDisallow: /\n\nSitemap: https://staging.zenbujapanese.com/sitemap-index.xml\n'
    )
  })

  test('local development disallows crawling and lists the sitemap index where it is served', () => {
    vi.stubEnv('SITE_ENV', '')
    expect(robotsTxt(request)).toBe(
      'User-Agent: *\nDisallow: /\n\nSitemap: http://localhost:3100/sitemap-index.xml\n'
    )
  })
})
