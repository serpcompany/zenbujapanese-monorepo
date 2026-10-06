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

function currentSection(pathname: string): string | null {
  const path = withSlash(pathname)
  return headerSections.find(section => path.startsWith(section.path))?.path ?? null
}

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
