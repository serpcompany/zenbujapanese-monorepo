import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { placeholderHref, site, socialLinks } from '@/lib/site'
import { SiteFooter } from './site-footer'

const footer = (locale: Locale = 'en') => renderToStaticMarkup(<SiteFooter locale={locale} />)

type FooterLink = [text: string, href: string, target?: string]

function columns(locale: Locale = 'en'): [heading: string, links: FooterLink[]][] {
  return [...footer(locale).matchAll(/<nav [^>]*><h2 [^>]*>([^<]+)<\/h2>([\s\S]*?)<\/nav>/g)].map(
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

vi.hoisted(() => vi.stubEnv('ZENBU_ACCOUNT_PAGES', 'open'))
beforeEach(() => vi.stubEnv('ZENBU_ACCOUNT_PAGES', 'open'))
afterEach(() => vi.unstubAllEnvs())

test('the footer groups its links under Products, Tools, Company, and Legal', () => {
  expect(columns()).toEqual([
    [
      'Products',
      [
        ['Zenbu Japanese for iPhone', '/products/zenbu-japanese-app/', 'iphone-app'],
        ['Dictionary', '/dictionary/'],
        ['Sign in', '/login/', 'login']
      ]
    ],
    [
      'Tools',
      [
        ['Kana charts', '/dictionary/browse/kana/'],
        ['Kanji lists', '/dictionary/browse/kanji/'],
        ['Frequency lists', '/dictionary/browse/frequency-dictionaries/'],
        ['All tools', '/tools/', 'tools']
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

test('the footer leads to signing in, as the server draws it before the browser knows', () => {
  expect(columns()[0]).toEqual([
    'Products',
    expect.arrayContaining([['Sign in', '/login/', 'login']])
  ])
})

test("the footer leaves signing in out where the site's account pages are closed", () => {
  vi.stubEnv('ZENBU_ACCOUNT_PAGES', 'closed')
  expect(columns().flatMap(([, links]) => links.map(([text]) => text))).not.toContain('Sign in')
  expect(footer()).not.toContain('/login/')
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
  expect(html).toContain(getDictionary('en').site.description)
})

const footerEnding = (locale: Locale = 'en') =>
  footer(locale).match(/<\/nav><\/div><div [^>]*>([\s\S]*)<\/div><\/div><\/footer>$/)?.[1] ?? ''

const classesOf = (tag: string | undefined) => tag?.match(/class="([^"]*)"/)?.[1].split(' ') ?? []

const brandMark =
  /^<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" class="size-4"><path d="[^"]+"><\/path><\/svg>/

test('from 768 pixels the bottom row shows the nine brand marks at 16 pixels in 28-pixel targets, each linking its account in src/lib/site.ts', () => {
  const list = footerEnding().match(
    /<ul aria-label="Zenbu Japanese elsewhere" class="([^"]*)">([\s\S]*?)<\/ul>/
  )
  expect(list?.[1].split(' ')).toEqual(
    expect.arrayContaining(['hidden', 'md:flex', 'md:ml-auto', 'gap-1'])
  )
  const links = [...(list?.[2] ?? '').matchAll(/<a ([^>]*)>([\s\S]*?)<\/a>/g)]
  expect(
    links.map(([, , content]) => content.match(/<span class="sr-only">([^<]+)</)?.[1])
  ).toEqual(socialLinks.map(link => `${site.name} on ${link.name}`))
  for (const [index, [, attributes, content]] of links.entries()) {
    expect(attributes).toContain(`href="${socialLinks[index].href}"`)
    expect(attributes).toContain(`data-link-target="${socialLinks[index].id}"`)
    expect(classesOf(`<a ${attributes}>`)).toEqual(
      expect.arrayContaining(['size-7', 'hover:bg-background', 'dark:hover:bg-background'])
    )
    expect(content).toMatch(brandMark)
  }
})

test('from 768 pixels a divider sits between the icons and the language menu, hidden from screen readers', () => {
  const ending = footerEnding()
  const divider = ending.match(/<div [^>]*role="separator"[^>]*>/)?.[0]
  expect(divider).toContain('aria-hidden="true"')
  expect(classesOf(divider)).toEqual(expect.arrayContaining(['hidden', 'md:block']))
  expect(ending.indexOf('aria-label="Zenbu Japanese elsewhere"')).toBeLessThan(
    ending.indexOf('role="separator"')
  )
  expect(ending.indexOf('role="separator"')).toBeLessThan(
    ending.indexOf('aria-label="EN, English, change language"')
  )
})

test('below 768 pixels a Socials menu takes the icons’ place, just before the language menu', () => {
  const ending = footerEnding()
  const socials = ending.match(
    /<button [^>]*aria-label="Socials, Zenbu Japanese elsewhere"[^>]*><svg [^>]*lucide-at-sign[^>]*>[\s\S]*?<\/svg>Socials<svg [^>]*lucide-chevron-down[^>]*>[\s\S]*?<\/svg><\/button><button [^>]*aria-label="EN, English, change language"/
  )
  expect(socials).not.toBeNull()
  expect(classesOf(socials?.[0])).toEqual(expect.arrayContaining(['md:hidden', '-my-2']))
  expect(ending.indexOf('aria-label="Zenbu Japanese elsewhere"')).toBeLessThan(
    ending.indexOf('aria-label="Socials, Zenbu Japanese elsewhere"')
  )
})

test('the footer ends with the copyright, the language menu, and the Sitemap', () => {
  const ending = footerEnding()
  expect(ending).toContain(`© ${new Date().getFullYear()} ${site.name}`)
  expect(ending).toMatch(
    /<button [^>]*aria-label="EN, English, change language"[^>]*><svg [^>]*data-flag="US"[^>]*>[\s\S]*?<\/svg>EN<svg [^>]*lucide-chevron-down[^>]*>[\s\S]*?<\/svg><\/button><a [^>]*href="\/sitemap\/"[^>]*>Sitemap<\/a><\/div>$/
  )
})

test('a Japanese page’s footer is in Japanese, and its links stay in Japanese', () => {
  const [products, tools, company, legal] = columns('ja')
  expect([products[0], tools[0], company[0], legal[0]]).toEqual([
    '製品',
    'ツール',
    '会社情報',
    '規約'
  ])
  for (const [, links] of columns('ja')) {
    for (const [, href] of links) {
      expect(href === placeholderHref || href.startsWith('/ja/'), href).toBe(true)
    }
  }
  expect(footer('ja')).toContain(getDictionary('ja').site.description)
  const ending = footerEnding('ja')
  expect(ending).toMatch(
    /aria-label="JA, 日本語、表示言語を切り替える"[^>]*><svg [^>]*data-flag="JP"/
  )
  expect(ending).toMatch(/<a [^>]*href="\/ja\/sitemap\/"[^>]*>サイトマップ<\/a><\/div>$/)
  expect(ending).toContain('<ul aria-label="Zenbu JapaneseのSNS"')
  expect(ending).toMatch(
    /aria-label="Zenbu JapaneseのSNS"[^>]*><svg [^>]*lucide-at-sign[\s\S]*?<\/svg>SNS<svg /
  )
})
