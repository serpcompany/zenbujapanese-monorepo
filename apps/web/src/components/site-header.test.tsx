import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { appStoreLink, loginLink, placeholderHref } from '@/lib/site'
import { SiteHeader } from './site-header'

const navigation = vi.hoisted(() => ({ pathname: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }))

const sections = ['Dictionary', 'Tools', 'Products', 'Company']

function header(pathname: string): string {
  navigation.pathname = pathname
  return renderToStaticMarkup(<SiteHeader />)
}

const attribute = (attributes: string, name: string) =>
  attributes.match(new RegExp(`${name}="([^"]+)"`))?.[1] ?? null

function triggers(html: string): [label: string, current: string | null][] {
  return [
    ...html.matchAll(/<button ([^>]*data-slot="navigation-menu-trigger"[^>]*)>([^<]+)</g)
  ].map(([, attributes, label]) => [label.trim(), attribute(attributes, 'aria-current')])
}

type MenuLink = [href: string | null, target: string | null, current: string | null]

function menuLinks(html: string): MenuLink[] {
  return [...html.matchAll(/<a ([^>]*data-slot="navigation-menu-link"[^>]*)>/g)].map(
    ([, attributes]) => [
      attribute(attributes, 'href'),
      attribute(attributes, 'data-link-target'),
      attribute(attributes, 'aria-current')
    ]
  )
}

const page = (href: string): MenuLink => [href, null, null]
const placeholder = (target: string): MenuLink => [placeholderHref, target, null]

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
    expect(triggers(header(path))).toEqual(
      sections.map(label => [label, label === section ? 'true' : null])
    )
  })

  test.each(['/', '/sitemap/', '/dictionaryx/'])('%s is in none', path => {
    expect(triggers(header(path)).filter(([, current]) => current !== null)).toEqual([])
  })
})

describe("the header's menus are in the page's HTML, with the current page marked", () => {
  test('the Dictionary menu leads to the dictionary and its browse pages', () => {
    expect(menuLinks(header('/')).slice(0, 8)).toEqual([
      page('/dictionary/'),
      page('/dictionary/browse/hiragana/'),
      page('/dictionary/browse/katakana/'),
      page('/dictionary/browse/frequency-dictionaries/jlpt/n5/'),
      page('/dictionary/browse/frequency-dictionaries/'),
      page('/dictionary/browse/kanji/'),
      page('/dictionary/browse/parts-of-speech/'),
      page('/dictionary/browse/')
    ])
  })

  test('the Tools menu leads to the reference pages, and its planned pages are placeholders', () => {
    expect(menuLinks(header('/')).slice(8, 17)).toEqual([
      placeholder('tools'),
      page('/dictionary/'),
      page('/dictionary/browse/kana/'),
      page('/dictionary/browse/kanji/'),
      page('/dictionary/browse/frequency-dictionaries/'),
      placeholder('hiragana-to-katakana'),
      placeholder('romaji-to-kana'),
      placeholder('kanji-to-furigana'),
      placeholder('tools')
    ])
  })

  test('the Products menu leads to the web dictionary, and its planned pages are placeholders', () => {
    expect(menuLinks(header('/')).slice(17, 25)).toEqual([
      placeholder('iphone-app'),
      placeholder('iphone-app'),
      placeholder('browser-extension'),
      page('/dictionary/'),
      placeholder('tools'),
      placeholder('reference-guides'),
      placeholder('courses'),
      placeholder('products')
    ])
  })

  test('the Company menu leads to About, Sources, Support, Contact, and Legal', () => {
    expect(menuLinks(header('/support/')).slice(25)).toEqual([
      page('/about/'),
      page('/sources/'),
      ['/support/', null, 'page'],
      page('/contact/'),
      page('/legal/')
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

test('below 1024 pixels the header has a menu button, and from 1024 the menus', () => {
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

function headerButtons(html: string): [attributes: string, content: string][] {
  return [...html.matchAll(/<a ([^>]*data-slot="button"[^>]*)>([\s\S]*?)<\/a>/g)].map(
    ([, attributes, content]) => [attributes, content]
  )
}

test('from 1024 pixels Log in and Get the app end the header, at their links in src/lib/site.ts', () => {
  const buttons = headerButtons(header('/dictionary/'))
  expect(buttons.map(([attributes]) => attribute(attributes, 'data-link-target'))).toEqual([
    loginLink.id,
    appStoreLink.id
  ])
  for (const [attributes] of buttons) {
    expect(attributes.match(/class="([^"]*)"/)?.[1].split(' ')).toContain('max-lg:hidden')
  }
  expect(attribute(buttons[0][0], 'href')).toBe(loginLink.href)
  expect(buttons[0][1]).toBe('Log in')
  expect(attribute(buttons[1][0], 'href')).toBe(appStoreLink.href)
})

test('the Get the app button leads with a phone icon', () => {
  const [, content = ''] = headerButtons(header('/dictionary/'))[1] ?? []
  expect(content).toMatch(
    /^<svg [^>]*class="lucide lucide-smartphone[^"]*"[^>]*data-icon="inline-start"/
  )
  expect(content).toMatch(/<svg [^>]*aria-hidden="true"/)
  expect(content.replace(/<svg[\s\S]*?<\/svg>/, '')).toBe('Get the app')
})
