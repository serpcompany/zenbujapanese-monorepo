import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { sitePages } from '@/lib/pages'
import { SiteFooter } from './site-footer'

// Renders the footer as the server does and reads its links back, so the footer keeps the #462
// design's links, in its order, and links only pages that exist.

function footerLinks(): [text: string, href: string][] {
  const html = renderToStaticMarkup(<SiteFooter />)
  // Outside Next.js, Link drops the trailing slash `trailingSlash: true` adds to the page's HTML.
  return [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map(([, href, text]) => [
    text,
    href.endsWith('/') ? href : `${href}/`
  ])
}

test('the footer links what the #462 design lists, in its order', () => {
  expect(footerLinks()).toEqual([
    ['Contact', '/contact/'],
    ['Legal', '/legal/'],
    ['Privacy', '/legal/privacy/'],
    ['Terms', '/legal/terms/'],
    ['Sources', '/sources/'],
    ['Sitemap', '/sitemap/']
  ])
})

test('every footer link is a page the site has', () => {
  const paths: string[] = sitePages.map(page => page.path)
  expect(footerLinks().filter(([, href]) => !paths.includes(href))).toEqual([])
})
