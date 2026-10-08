import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { absoluteUrl, servedOrigin, siteOrigin } from './site'

const request = new Request('http://localhost:3100/sitemap-pages.xml')

beforeEach(() => {
  vi.stubEnv('SITE_ENV', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('each environment writes its own URLs', () => {
  test.each([
    ['production', 'https://zenbujapanese.com', 'https://zenbujapanese.com'],
    ['staging', 'https://staging.zenbujapanese.com', 'https://staging.zenbujapanese.com'],
    ['', 'https://zenbujapanese.com', 'http://localhost:3100']
  ])('SITE_ENV=%j: canonical origin %s, sitemaps on %s', (env, canonical, served) => {
    vi.stubEnv('SITE_ENV', env)
    expect(siteOrigin()).toBe(canonical)
    expect(servedOrigin(request)).toBe(served)
  })

  test('the homepage is the origin, with no trailing slash', () => {
    vi.stubEnv('SITE_ENV', 'staging')
    expect(absoluteUrl('/')).toBe('https://staging.zenbujapanese.com')
    expect(absoluteUrl('/', 'http://localhost:3100')).toBe('http://localhost:3100')
  })

  test('a page keeps its trailing slash and its encoding', () => {
    expect(absoluteUrl('/dictionary/%E8%A6%8B%E3%82%8B-1259290/')).toBe(
      'https://zenbujapanese.com/dictionary/%E8%A6%8B%E3%82%8B-1259290/'
    )
  })
})

async function siteWhereAccountPagesAre(state: 'open' | 'closed') {
  vi.stubEnv('ZENBU_ACCOUNT_PAGES', state)
  vi.resetModules()
  return import('./site')
}

const accountTargets = [
  ['Log in', 'login', '/login/'],
  ['Create an account', 'register', '/register/']
] as const

describe('the Log in and Create an account targets', () => {
  test.each(
    accountTargets
  )("%s opens its page in a build whose account pages are open, and isn't a placeholder", async (_, id, path) => {
    const { linkTo, placeholderLinks } = await siteWhereAccountPagesAre('open')
    expect(linkTo(id)).toEqual({ href: path, target: id })
    expect(placeholderLinks.map(link => link.id)).not.toContain(id)
  })

  test.each(
    accountTargets
  )('%s stays a # placeholder in a build whose account pages are closed', async (_, id) => {
    const { linkTo, placeholderLinks } = await siteWhereAccountPagesAre('closed')
    expect(linkTo(id)).toEqual({ href: '#', target: id })
    expect(placeholderLinks.map(link => link.id)).toContain(id)
  })
})
