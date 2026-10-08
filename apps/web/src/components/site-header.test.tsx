import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { appStoreLink } from '@/lib/site'
import { SiteHeader } from './site-header'

const navigation = vi.hoisted(() => ({ pathname: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }))

function header(pathname: string): string {
  navigation.pathname = pathname
  return renderToStaticMarkup(<SiteHeader />)
}

function triggers(html: string): [label: string, current: string | null][] {
  return [
    ...html.matchAll(/<button ([^>]*data-slot="navigation-menu-trigger"[^>]*)>([^<]+)</g)
  ].map(([, attributes, label]) => [
    label.trim(),
    attributes.match(/aria-current="([^"]+)"/)?.[1] ?? null
  ])
}

function menuLinks(html: string): [href: string, current: string | null][] {
  return [...html.matchAll(/<a ([^>]*data-slot="navigation-menu-link"[^>]*)>/g)].map(
    ([, attributes]) => [
      attributes.match(/href="([^"]+)"/)?.[1] ?? '',
      attributes.match(/aria-current="([^"]+)"/)?.[1] ?? null
    ]
  )
}

describe('the header marks the section the page is in', () => {
  beforeEach(() => {
    navigation.pathname = '/'
  })

  test.each([
    ['/dictionary/', 'Dictionary'],
    ['/dictionary', 'Dictionary'],
    ['/dictionary/search/iru/', 'Dictionary'],
    ['/dictionary/%E8%A6%81%E3%82%8B-1546640/', 'Dictionary'],
    ['/dictionary/browse/kana/', 'Dictionary'],
    ['/about/', 'Company'],
    ['/sources/', 'Company'],
    ['/legal/privacy/', 'Company']
  ])('%s is in %s', (path, section) => {
    expect(triggers(header(path))).toEqual([
      ['Dictionary', section === 'Dictionary' ? 'true' : null],
      ['Company', section === 'Company' ? 'true' : null]
    ])
  })

  test.each(['/', '/sitemap/', '/dictionaryx/'])('%s is in none', path => {
    expect(triggers(header(path)).filter(([, current]) => current !== null)).toEqual([])
  })
})

describe("the header's menus are in the page's HTML, with the current page marked", () => {
  test('the Dictionary menu leads to the dictionary and its browse pages', () => {
    expect(menuLinks(header('/')).slice(0, 8)).toEqual([
      ['/dictionary/', null],
      ['/dictionary/browse/hiragana/', null],
      ['/dictionary/browse/katakana/', null],
      ['/dictionary/browse/frequency-dictionaries/jlpt/n5/', null],
      ['/dictionary/browse/frequency-dictionaries/', null],
      ['/dictionary/browse/kanji/', null],
      ['/dictionary/browse/parts-of-speech/', null],
      ['/dictionary/browse/', null]
    ])
  })

  test('the Company menu leads to About, Sources, Support, Contact, and Legal', () => {
    expect(menuLinks(header('/support/')).slice(8)).toEqual([
      ['/about/', null],
      ['/sources/', null],
      ['/support/', 'page'],
      ['/contact/', null],
      ['/legal/', null]
    ])
  })

  test.each([
    '/',
    '/about/',
    '/dictionary/%E8%A6%81%E3%82%8B-1546640/'
  ])('the header on %s has no search and no email address', path => {
    const html = header(path)
    expect(html).not.toContain('<search')
    expect(html).not.toContain('name="q"')
    expect(html).not.toContain('@')
  })
})

test('below 1024 pixels the header has a menu button, and from 1024 the menus and Get the app', () => {
  const html = header('/')
  const menu = html.match(/<button [^>]*aria-label="Menu"[^>]*>/)?.[0] ?? ''
  expect(menu).toContain('aria-haspopup="dialog"')
  expect(menu).toContain('aria-expanded="false"')
  expect(menu.match(/class="([^"]*)"/)?.[1].split(' ')).toContain('lg:hidden')
  const nav = html.match(/<nav [^>]*aria-label="Main"[^>]*>/)?.[0] ?? ''
  expect(nav.match(/class="([^"]*)"/)?.[1].split(' ')).toContain('max-lg:hidden')
  const name = html.match(/<span class="([^"]*)">Zenbu Japanese<\/span>/)?.[1] ?? ''
  expect(name.split(' ')).toContain('max-lg:sr-only')
})

test('the Get the app button leads with a phone icon, to the App Store link in src/lib/site.ts', () => {
  const html = header('/dictionary/')
  const [, attributes = '', content = ''] =
    html.match(/<a ([^>]*data-slot="button"[^>]*)>([\s\S]*?)<\/a>/) ?? []
  expect(attributes).toContain(`href="${appStoreLink.href}"`)
  expect(attributes).toContain(`data-outside-link="${appStoreLink.id}"`)
  expect(attributes.match(/class="([^"]*)"/)?.[1].split(' ')).toContain('max-lg:hidden')
  expect(content).toMatch(
    /^<svg [^>]*class="lucide lucide-smartphone[^"]*"[^>]*data-icon="inline-start"/
  )
  expect(content).toMatch(/<svg [^>]*aria-hidden="true"/)
  expect(content.replace(/<svg[\s\S]*?<\/svg>/, '')).toBe('Get the app')
})
