import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { sitePages } from '@/lib/pages'
import { SiteFooter } from './site-footer'

const withTrailingSlash = (href: string) => (href.endsWith('/') ? href : `${href}/`)

function footerLinks(): [text: string, href: string][] {
  const html = renderToStaticMarkup(<SiteFooter />)
  return [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map(([, href, text]) => [
    text,
    withTrailingSlash(href)
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
