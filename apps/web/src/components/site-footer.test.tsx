import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { SiteFooter } from './site-footer'

// Renders the footer as the server does and reads its links back, so a link the #462 design
// lists can't go missing unnoticed.

function footerLinks(): [text: string, href: string][] {
  const html = renderToStaticMarkup(<SiteFooter />)
  // Outside Next.js, Link drops the trailing slash `trailingSlash: true` adds to the page's HTML.
  return [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map(([, href, text]) => [
    text,
    href.endsWith('/') ? href : `${href}/`
  ])
}

test('the footer links Legal after Contact, before the legal pages, as the #462 design does', () => {
  const links = footerLinks()
  expect(links).toContainEqual(['Legal', '/legal/'])
  const titles = links.map(([text]) => text)
  expect(titles.indexOf('Legal')).toBe(titles.indexOf('Contact') + 1)
  expect(titles.indexOf('Legal')).toBeLessThan(titles.indexOf('Privacy Policy'))
})
