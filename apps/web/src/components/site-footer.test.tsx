import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { site } from '@/lib/site'
import { SiteFooter } from './site-footer'

const withTrailingSlash = (href: string) => (href.endsWith('/') ? href : `${href}/`)

const footer = () => renderToStaticMarkup(<SiteFooter />)

function links(html: string): [text: string, href: string][] {
  return [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map(([, href, text]) => [
    text,
    withTrailingSlash(href)
  ])
}

function columns(): [heading: string, links: string[]][] {
  return [...footer().matchAll(/<nav [^>]*><h2 [^>]*>([^<]+)<\/h2>([\s\S]*?)<\/nav>/g)].map(
    ([, heading, list]) => [heading, links(list).map(([text]) => text)]
  )
}

test('the footer links Legal after Contact, before the legal pages, as the #462 design does', () => {
  const footerLinks = links(footer())
  expect(footerLinks).toContainEqual(['Legal', '/legal/'])
  const titles = footerLinks.map(([text]) => text)
  expect(titles.indexOf('Legal')).toBe(titles.indexOf('Contact') + 1)
  expect(titles.indexOf('Legal')).toBeLessThan(titles.indexOf('Privacy Policy'))
})

test('the footer groups every link under Product, Company, and Policies', () => {
  expect(columns()).toEqual([
    ['Product', ['Dictionary', 'Browse by kana', 'Kanji by grade', 'Sources', 'Sitemap']],
    ['Company', ['About', 'Support', 'Contact']],
    [
      'Policies',
      ['Legal', 'Privacy Policy', 'Terms of Use', 'DMCA Copyright Policy', 'Affiliate Disclosure']
    ]
  ])
})

test("the footer's browse links open the kana charts and the kanji lists", () => {
  const footerLinks = links(footer())
  expect(footerLinks).toContainEqual(['Browse by kana', '/dictionary/browse/kana/'])
  expect(footerLinks).toContainEqual(['Kanji by grade', '/dictionary/browse/kanji/'])
})

test('the footer leads with the brand linking home and its tagline, and ends with the copyright', () => {
  const html = footer()
  const firstLink = html.match(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
  expect(firstLink?.[1]).toBe('/')
  expect(firstLink?.[2]).toContain(`>${site.name}</span>`)
  expect(html).toContain(site.description)
  const copyright = html.match(/<p [^>]*>©([\s\S]*?)<\/p>\s*<\/div>\s*<\/footer>$/)?.[1] ?? ''
  expect(copyright).toContain(String(new Date().getFullYear()))
  expect(copyright).toContain(site.name)
})
