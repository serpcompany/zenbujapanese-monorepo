import { describe, expect, it } from 'vitest'
import { locales } from './i18n/config'
import { sitePagesIn, sitePaths } from './pages'

describe('site pages', () => {
  it('uses the trailing-slash form for every page URL', () => {
    for (const path of sitePaths) expect(path).toMatch(/\/$/)
  })

  it('names every page, with a description, in every language', () => {
    for (const locale of locales) {
      for (const page of sitePagesIn(locale)) {
        expect(page.title, `${locale} ${page.path}`).not.toBe('')
        expect(page.description, `${locale} ${page.path}`).not.toBe('')
      }
    }
  })
})
