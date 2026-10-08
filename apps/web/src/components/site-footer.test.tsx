import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { placeholderHref, site, socialLinks } from '@/lib/site'
import { SiteFooter } from './site-footer'

const footer = () => renderToStaticMarkup(<SiteFooter />)

type FooterLink = [text: string, href: string, target?: string]

function columns(): [heading: string, links: FooterLink[]][] {
  return [...footer().matchAll(/<nav [^>]*><h2 [^>]*>([^<]+)<\/h2>([\s\S]*?)<\/nav>/g)].map(
    ([, heading, list]) => [
      heading,
      [...list.matchAll(/<a ([^>]*)>([^<]+)<\/a>/g)].map(([, attributes, text]) => {
        const href = attributes.match(/href="([^"]+)"/)?.[1] ?? ''
        const target = attributes.match(/data-link-target="([^"]+)"/)?.[1]
        return target ? [text, href, target] : [text, href]
      })
    ]
  )
}

test('the footer groups its links under Products, Tools, Company, and Legal', () => {
  expect(columns()).toEqual([
    [
      'Products',
      [
        ['Zenbu Japanese for iPhone', '/products/zenbu-japanese-for-iphone/', 'iphone-app'],
        ['Dictionary', '/dictionary/']
      ]
    ],
    [
      'Tools',
      [
        ['Kana charts', '/dictionary/browse/kana/'],
        ['Kanji lists', '/dictionary/browse/kanji/'],
        ['Frequency lists', '/dictionary/browse/frequency-dictionaries/'],
        ['All tools', placeholderHref, 'tools']
      ]
    ],
    [
      'Company',
      [
        ['About', '/about/'],
        ['Support', '/support/'],
        ['Contact', '/contact/'],
        ['Sources', '/sources/']
      ]
    ],
    [
      'Legal',
      [
        ['Privacy Policy', '/legal/privacy/'],
        ['Terms of Use', '/legal/terms/'],
        ['DMCA', '/legal/dmca/'],
        ['Affiliate Disclosure', '/legal/affiliate-disclosure/']
      ]
    ]
  ])
})

test('the footer stacks its columns into one on phones, and lays them side by side from 768 pixels', () => {
  const grid =
    footer()
      .match(/<div class="(grid [^"]*)">/)?.[1]
      .split(' ') ?? []
  expect(grid).toContain('grid-cols-1')
  expect(grid).toContain('md:grid-cols-[1.5fr_repeat(4,minmax(0,1fr))]')
})

test('the footer leads with the brand linking home and its tagline', () => {
  const html = footer()
  const firstLink = html.match(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
  expect(firstLink?.[1]).toBe('/')
  expect(firstLink?.[2]).toContain(`>${site.name}</span>`)
  expect(html).toContain(site.description)
})

const brandIcon =
  /^<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" class="size-5"><path d="[^"]+"><\/path><\/svg>/

test('a row of plain brand icons, five to a row on phones, links each account in src/lib/site.ts', () => {
  const html = footer()
  const list = html.match(
    /<ul aria-label="Zenbu Japanese elsewhere" class="([^"]*)">([\s\S]*?)<\/ul>/
  )
  expect(list?.[1].split(' ')).toEqual(expect.arrayContaining(['grid', 'grid-cols-5']))
  const links = [...(list?.[2] ?? '').matchAll(/<a ([^>]*)>([\s\S]*?)<\/a>/g)]
  expect(
    links.map(([, , content]) => content.match(/<span class="sr-only">([^<]+)</)?.[1])
  ).toEqual(socialLinks.map(link => `${site.name} on ${link.name}`))
  for (const [index, [, attributes, content]] of links.entries()) {
    expect(attributes).toContain(`href="${socialLinks[index].href}"`)
    expect(attributes).toContain(`data-link-target="${socialLinks[index].id}"`)
    expect(content).toMatch(brandIcon)
  }
})

test('the footer ends with the copyright and the Sitemap', () => {
  const ending = footer().match(/<\/ul><div [^>]*>([\s\S]*)<\/div><\/div><\/footer>$/)?.[1] ?? ''
  expect(ending).toContain(`© ${new Date().getFullYear()} ${site.name}`)
  expect(ending).toMatch(/<a [^>]*href="\/sitemap\/"[^>]*>Sitemap<\/a>$/)
})
