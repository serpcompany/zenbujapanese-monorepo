import { describe, expect, test } from 'vitest'
import { otherHostResponse, smokeTestHeader } from './other-hosts'

const www = 'https://www.zenbujapanese.com'
const production = 'https://zenbujapanese.com'
const staging = 'https://staging.zenbujapanese.com'
const worker = 'https://zenbujapanese-web-staging.example.workers.dev'

const answer = (url: string, siteEnv?: string, headers: Record<string, string> = {}) =>
  otherHostResponse(new Request(url, { headers }), siteEnv)

describe('otherHostResponse', () => {
  test.each([
    [`${www}/`, `${production}/`],
    [`${www}/about`, `${production}/about/`],
    [`${www}/about/`, `${production}/about/`],
    [`${www}/dictionary/search/eat?from=app`, `${production}/dictionary/search/eat/?from=app`],
    [
      `${www}/dictionary/%E8%A6%81%E3%82%8B-1546640`,
      `${production}/dictionary/%E8%A6%81%E3%82%8B-1546640/`
    ],
    [`${www}/robots.txt`, `${production}/robots.txt`],
    [`${www}/sitemap-pages.xml/`, `${production}/sitemap-pages.xml`],
    [
      `${www}/dictionary/examples/1259290.json?build=b1&from=5`,
      `${production}/dictionary/examples/1259290.json?build=b1&from=5`
    ],
    [`${www}/privacy`, `${production}/legal/privacy/`],
    [`${www}/privacy/?from=app`, `${production}/legal/privacy/?from=app`],
    [`${www}/_next/image?url=%2Fa.png&w=64`, `${production}/_next/image?url=%2Fa.png&w=64`],
    [`${www}/.well-known/change-password`, `${production}/.well-known/change-password`],
    [`${www}/api/auth/get-session`, `${production}/api/auth/get-session`],
    [`${www}/api`, `${production}/api`],
    [`${www}/API/x/`, `${production}/API/x/`],
    [`${www}/apiary`, `${production}/apiary/`],
    [`${www}/docs/api`, `${production}/docs/api/`]
  ])('sends %s to %s in one 308', (from, to) => {
    const response = answer(from, 'production')
    expect(response?.status).toBe(308)
    expect(response?.headers.get('location')).toBe(to)
  })

  test.each([
    ['staging', staging],
    [undefined, staging],
    ['production', production]
  ])("sends a workers.dev request to its environment's host: %s", (siteEnv, origin) => {
    for (const path of ['/legal/terms', '/legal/terms/']) {
      const response = answer(`${worker}${path}`, siteEnv)
      expect(response?.status).toBe(308)
      expect(response?.headers.get('location')).toBe(`${origin}/legal/terms/`)
    }
  })

  test('leaves a workers.dev request alone when it carries the smoke test header', () => {
    expect(answer(`${worker}/legal/terms/`, 'staging', { [smokeTestHeader]: '1' })).toBeNull()
  })

  test.each([
    `${production}/about`,
    `${staging}/about`,
    'http://localhost:8787/about',
    'https://notworkers.dev.example.com/about'
  ])('leaves %s to the site', url => {
    expect(answer(url, 'production')).toBeNull()
  })
})
