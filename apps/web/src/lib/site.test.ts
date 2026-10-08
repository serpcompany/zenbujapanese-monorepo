import { afterEach, expect, test, vi } from 'vitest'

async function siteWhereAccountPagesAre(state: 'open' | 'closed') {
  vi.stubEnv('ZENBU_ACCOUNT_PAGES', state)
  vi.resetModules()
  return import('./site')
}

afterEach(() => vi.unstubAllEnvs())

test("Log in opens /login/ in a build whose account pages are open, and isn't a placeholder", async () => {
  const { linkTo, placeholderLinks } = await siteWhereAccountPagesAre('open')
  expect(linkTo('login')).toEqual({ href: '/login/', target: 'login' })
  expect(placeholderLinks.map(link => link.id)).not.toContain('login')
})

test('Log in stays a # placeholder in a build whose account pages are closed', async () => {
  const { linkTo, placeholderLinks } = await siteWhereAccountPagesAre('closed')
  expect(linkTo('login')).toEqual({ href: '#', target: 'login' })
  expect(placeholderLinks.map(link => link.id)).toContain('login')
})
