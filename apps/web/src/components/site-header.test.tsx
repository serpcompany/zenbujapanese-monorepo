import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { SiteHeader } from './site-header'

const navigation = vi.hoisted(() => ({ pathname: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }))

function header(pathname: string): string {
  navigation.pathname = pathname
  return renderToStaticMarkup(<SiteHeader />)
}

function mainNav(html: string): string {
  return html.match(/<nav aria-label="Main"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? ''
}

function navLinks(html: string): [text: string, current: string | null][] {
  return [...mainNav(html).matchAll(/<a ([^>]*)>([^<]+)<\/a>/g)].map(([, attributes, text]) => [
    text,
    attributes.match(/aria-current="([^"]+)"/)?.[1] ?? null
  ])
}

function navClasses(html: string, text: string): string[] {
  const classes = mainNav(html).match(new RegExp(`<a [^>]*class="([^"]*)"[^>]*>${text}</a>`))
  return classes?.[1].split(' ') ?? []
}

describe('the header nav marks the current section, as the #462 design does', () => {
  beforeEach(() => {
    navigation.pathname = '/'
  })

  test.each([
    ['/dictionary/', 'page'],
    ['/dictionary', 'page'],
    ['/dictionary/search/iru/', 'true'],
    ['/dictionary/%E8%A6%81%E3%82%8B-1546640/', 'true']
  ])('Dictionary on %s', (path, current) => {
    const html = header(path)
    expect(navLinks(html)).toEqual([
      ['Dictionary', current],
      ['About', null],
      ['Support', null]
    ])
    expect(navClasses(html, 'Dictionary')).toEqual(
      expect.arrayContaining(['bg-muted', 'text-foreground'])
    )
    expect(navClasses(html, 'About')).not.toContain('bg-muted')
    expect(navClasses(html, 'About')).toContain('text-muted-foreground')
  })

  test.each([
    ['/about/', 'About'],
    ['/support/', 'Support']
  ])('%s marks %s', (path, section) => {
    const links = navLinks(header(path))
    expect(links.filter(([, current]) => current !== null)).toEqual([[section, 'page']])
  })

  test.each(['/', '/legal/privacy/', '/sources/', '/dictionaryx/'])('%s marks none', path => {
    const html = header(path)
    expect(navLinks(html).filter(([, current]) => current !== null)).toEqual([])
    expect(navClasses(html, 'Dictionary')).not.toContain('bg-muted')
  })
})

test.each([
  '/',
  '/about/',
  '/dictionary/%E8%A6%81%E3%82%8B-1546640/'
])('the header on %s has no search, and a menu button for phones', path => {
  const html = header(path)
  expect(html).not.toContain('<search')
  expect(html).not.toContain('name="q"')
  const menu = html.match(/<button [^>]*aria-label="Menu"[^>]*>/)?.[0] ?? ''
  expect(menu).toContain('aria-haspopup="dialog"')
  expect(menu).toContain('aria-expanded="false"')
  expect(menu.match(/class="([^"]*)"/)?.[1].split(' ')).toContain('md:hidden')
})

test('the Get the app button leads with a phone icon', () => {
  const html = header('/dictionary/')
  const button = html.match(/<a [^>]*data-slot="button"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? ''
  expect(button).toMatch(
    /^<svg [^>]*class="lucide lucide-smartphone[^"]*"[^>]*data-icon="inline-start"/
  )
  expect(button).toMatch(/<svg [^>]*aria-hidden="true"/)
  expect(button.replace(/<svg[\s\S]*?<\/svg>/, '')).toBe('Get the app')
})
