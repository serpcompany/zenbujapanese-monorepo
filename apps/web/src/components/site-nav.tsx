'use client'

import { cn } from 'cn'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

/** The header nav's sections, in the #462 design's order. */
export const headerSections = [
  { path: '/dictionary/', label: 'Dictionary' },
  { path: '/about/', label: 'About' },
  { path: '/support/', label: 'Support' }
] as const

const withSlash = (path: string) => (path.endsWith('/') ? path : `${path}/`)

/**
 * The section a page belongs to: the one whose path is the page's or leads it, so a word, kanji,
 * or search page is in Dictionary. Null for a page in none, such as home or the legal pages.
 */
export function currentSection(pathname: string): string | null {
  const path = withSlash(pathname)
  return headerSections.find(section => path.startsWith(section.path))?.path ?? null
}

/**
 * The header's nav, on wide screens. The #462 design marks the current section (Dictionary on
 * the dictionary pages) in the foreground color and medium weight. Screen readers hear it as the
 * current page on the section's own page, and as current on the pages under it.
 */
export function SiteNav() {
  const path = withSlash(usePathname())
  const current = currentSection(path)
  return (
    <nav
      aria-label="Main"
      className="flex items-center gap-5 text-sm text-muted-foreground max-md:hidden"
    >
      {headerSections.map(section => {
        const isCurrent = section.path === current
        return (
          <Link
            key={section.path}
            href={section.path}
            aria-current={isCurrent ? (path === section.path ? 'page' : 'true') : undefined}
            className={cn('hover:text-foreground', isCurrent && 'font-medium text-foreground')}
          >
            {section.label}
          </Link>
        )
      })}
    </nav>
  )
}
