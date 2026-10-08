import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { site, socialLinks } from '@/lib/site'
import { SiteFooter } from './site-footer'

const footer = () => renderToStaticMarkup(<SiteFooter />)

function columns(): [heading: string, links: [text: string, href: string][]][] {
  return [...footer().matchAll(/<nav [^>]*><h2 [^>]*>([^<]+)<\/h2>([\s\S]*?)<\/nav>/g)].map(
    ([, heading, list]) => [
      heading,
      [...list.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map(([, href, text]) => [
        text,
        href
      ])
    ]
  )
}

test('the footer groups its links under Products, Tools, Company, and Legal', () => {
  expect(columns()).toEqual([
    ['Products', [['Dictionary', '/dictionary/']]],
    [
      'Tools',
      [
        ['Kana charts', '/dictionary/browse/kana/'],
        ['Kanji lists', '/dictionary/browse/kanji/'],
        ['Frequency lists', '/dictionary/browse/frequency-dictionaries/']
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

test('a row of plain social icons, five to a row on phones, links each account in src/lib/site.ts', () => {
  const html = footer()
  const list = html.match(
    /<ul aria-label="Zenbu Japanese elsewhere" class="([^"]*)">([\s\S]*?)<\/ul>/
  )
  expect(list?.[1].split(' ')).toEqual(expect.arrayContaining(['grid', 'grid-cols-5']))
  const links = [...(list?.[2] ?? '').matchAll(/<a ([^>]*)>([\s\S]*?)<\/a>/g)]
  expect(links.map(([, attributes]) => attributes.match(/aria-label="([^"]+)"/)?.[1])).toEqual(
    socialLinks.map(link => `${site.name} on ${link.name}`)
  )
  for (const [index, [, attributes, content]] of links.entries()) {
    expect(attributes).toContain(`href="${socialLinks[index].href}"`)
    expect(attributes).toContain(`data-outside-link="${socialLinks[index].id}"`)
    expect(content).toMatch(/^<svg [^>]*aria-hidden="true"/)
  }
})

test('the footer ends with the copyright and the Sitemap', () => {
  const ending = footer().match(/<\/ul><div [^>]*>([\s\S]*)<\/div><\/div><\/footer>$/)?.[1] ?? ''
  expect(ending).toContain(`© ${new Date().getFullYear()} ${site.name}`)
  expect(ending).toMatch(/<a [^>]*href="\/sitemap\/"[^>]*>Sitemap<\/a>$/)
})
