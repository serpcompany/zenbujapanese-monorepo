'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const headerSections = [
  { path: '/dictionary/', label: 'Dictionary' },
  { path: '/about/', label: 'About' },
  { path: '/support/', label: 'Support' }
] as const

const withSlash = (path: string) => (path.endsWith('/') ? path : `${path}/`)

function ariaCurrentFor(path: string, sectionPath: string) {
  return path === sectionPath ? ('page' as const) : ('true' as const)
}

export function useSectionLinks() {
  const path = withSlash(usePathname())
  const current = headerSections.find(section => path.startsWith(section.path))?.path ?? null
  return headerSections.map(section => {
    const isCurrent = section.path === current
    return {
      ...section,
      isCurrent,
      ariaCurrent: isCurrent ? ariaCurrentFor(path, section.path) : undefined
    }
  })
}

export function SiteNav() {
  return (
    <nav aria-label="Main" className="flex items-center gap-1 text-sm max-md:hidden">
      {useSectionLinks().map(section => (
        <Link
          key={section.path}
          href={section.path}
          aria-current={section.ariaCurrent}
          className={cn(
            'rounded-md px-3 py-1.5 font-medium transition-colors hover:text-foreground',
            section.isCurrent ? 'bg-muted text-foreground' : 'text-muted-foreground'
          )}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  )
}
