import { describe, expect, test } from 'vitest'
import { getDictionary } from '@/lib/i18n/dictionary'
import { sitePaths } from '@/lib/pages'
import { accountMetadata } from './metadata'
import { type AccountPage, accountPages, returnedError } from './pages'

const pageNames = Object.keys(accountPages) as AccountPage[]

describe('the account pages', () => {
  test('are noindex, and in no sitemap, since the sitemaps list only the site pages', () => {
    const listed = new Set<string>(sitePaths)
    for (const page of pageNames) {
      expect(accountMetadata(page, 'en').robots, page).toEqual({ index: false, follow: false })
      expect(accountMetadata(page, 'ja').robots, page).toEqual({ index: false, follow: false })
      expect(listed.has(accountPages[page].path), page).toBe(false)
      expect(accountPages[page].path).toMatch(/^\/[a-z-]+\/$/)
    }
  })

  test("title each page in the reader's language, with its Japanese page as the alternate", () => {
    expect(accountMetadata('signIn', 'en')).toMatchObject({
      title: 'Sign in',
      description: 'Sign in to your Zenbu account. There is no password.',
      alternates: { canonical: '/login/', languages: { ja: '/ja/login/' } }
    })
    expect(accountMetadata('account', 'ja')).toMatchObject({
      title: 'アカウント',
      alternates: { canonical: '/ja/account/' }
    })
  })

  test('describe each page without naming Apple or Google, which a site offers only once set up', () => {
    for (const locale of ['en', 'ja'] as const) {
      for (const { description } of Object.values(getDictionary(locale).account.pages)) {
        expect(description).not.toMatch(/Apple|Google/)
      }
    }
  })

  test("read only a plain error code from where Google's sign-in comes back", () => {
    expect(returnedError({ error: 'account_not_linked' })).toBe('account_not_linked')
    expect(returnedError({ error: '<script>' })).toBeNull()
    expect(returnedError({ error: ['a', 'b'] })).toBeNull()
    expect(returnedError({})).toBeNull()
  })
})
