import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { SiteHeader } from './site-header'

// Renders the header as the server does for a page's path, and reads back its nav and its Get the
// app button: the #462 design marks the current section and gives Get the app an icon.

const navigation = vi.hoisted(() => ({ pathname: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }))

function header(pathname: string): string {
  navigation.pathname = pathname
  return renderToStaticMarkup(<SiteHeader />)
}

/** Each nav link's text and its aria-current, if any. */
function navLinks(html: string): [text: string, current: string | null][] {
  const nav = html.match(/<nav aria-label="Main"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? ''
  return [...nav.matchAll(/<a ([^>]*)>([^<]+)<\/a>/g)].map(([, attributes, text]) => [
    text,
    attributes.match(/aria-current="([^"]+)"/)?.[1] ?? null
  ])
}

/** The class of the nav link with this text. */
function navClass(html: string, text: string): string {
  const nav = html.match(/<nav aria-label="Main"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? ''
  return nav.match(new RegExp(`<a [^>]*class="([^"]*)"[^>]*>${text}</a>`))?.[1] ?? ''
}

describe('the header nav marks the current section, as the #462 design does', () => {
  beforeEach(() => {
    navigation.pathname = '/'
  })

  test.each([
    ['/dictionary/', 'page'],
    ['/dictionary/search/iru/', 'true'],
    ['/dictionary/%E8%A6%81%E3%82%8B-1546640/', 'true'],
    ['/dictionary/kanji/%E8%A6%81/', 'true'],
    ['/dictionary', 'page']
  ])('Dictionary on %s', (path, current) => {
    const html = header(path)
    expect(navLinks(html)).toEqual([
      ['Dictionary', current],
      ['About', null],
      ['Support', null]
    ])
    expect(navClass(html, 'Dictionary')).toContain('text-foreground')
    expect(navClass(html, 'Dictionary')).toContain('font-medium')
    expect(navClass(html, 'About')).not.toContain('font-medium')
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
    expect(navClass(html, 'Dictionary')).not.toContain('font-medium')
  })
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
