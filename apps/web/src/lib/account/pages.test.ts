import { describe, expect, test } from 'vitest'
import { sitePages } from '@/lib/pages'
import { accountMetadata, accountPages, returnedError } from './pages'

describe('the account pages', () => {
  test('are noindex, and in no sitemap, since the sitemaps list only the site pages', () => {
    const listed = new Set<string>(sitePages.map(page => page.path))
    for (const page of Object.keys(accountPages) as (keyof typeof accountPages)[]) {
      expect(accountMetadata(page).robots, page).toEqual({ index: false, follow: false })
      expect(listed.has(accountPages[page].path), page).toBe(false)
      expect(accountPages[page].path).toMatch(/^\/[a-z-]+\/$/)
    }
  })

  test('describe each page without naming Apple or Google, which a site offers only once set up', () => {
    for (const { description } of Object.values(accountPages)) {
      expect(description).not.toMatch(/Apple|Google/)
    }
  })

  test("read only a plain error code from where Google's sign-in comes back", () => {
    expect(returnedError({ error: 'account_not_linked' })).toBe('account_not_linked')
    expect(returnedError({ error: '<script>' })).toBeNull()
    expect(returnedError({ error: ['a', 'b'] })).toBeNull()
    expect(returnedError({})).toBeNull()
  })
})
