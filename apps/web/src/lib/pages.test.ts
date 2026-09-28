import { describe, expect, it } from 'vitest'
import { sitePages } from './pages'

describe('site pages', () => {
  it('uses the trailing-slash form for every page URL', () => {
    for (const page of sitePages) expect(page.path).toMatch(/\/$/)
  })
})
