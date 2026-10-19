import { describe, expect, it } from 'vitest'
import { locales } from './i18n/config'
import { sitePagesIn, sitePaths } from './pages'
import { characters, descriptionLength } from './snippets'
import { toolPagesIn } from './tools/tool-pages'

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

  it('describes every page and tool in 110 to 160 characters, in every language', () => {
    for (const locale of locales) {
      for (const page of [...sitePagesIn(locale), ...toolPagesIn(locale)]) {
        const length = characters(page.description)
        expect(length, `${locale} ${page.path}`).toBeGreaterThanOrEqual(descriptionLength.shortest)
        expect(length, `${locale} ${page.path}`).toBeLessThanOrEqual(descriptionLength.longest)
      }
    }
  })
})
