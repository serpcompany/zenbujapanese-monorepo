import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { SiteFooter } from './site-footer'

const withTrailingSlash = (href: string) => (href.endsWith('/') ? href : `${href}/`)

function footerLinks(): [text: string, href: string][] {
  const html = renderToStaticMarkup(<SiteFooter />)
  return [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map(([, href, text]) => [
    text,
    withTrailingSlash(href)
  ])
}

test('the footer links Legal after Contact, before the legal pages, as the #462 design does', () => {
  const links = footerLinks()
  expect(links).toContainEqual(['Legal', '/legal/'])
  const titles = links.map(([text]) => text)
  expect(titles.indexOf('Legal')).toBe(titles.indexOf('Contact') + 1)
  expect(titles.indexOf('Legal')).toBeLessThan(titles.indexOf('Privacy Policy'))
})
