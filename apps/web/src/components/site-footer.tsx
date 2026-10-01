import Link from 'next/link'
import { site } from '@/lib/site'

export const footerLinks = [
  { path: '/contact/', label: 'Contact' },
  { path: '/legal/', label: 'Legal' },
  { path: '/legal/privacy/', label: 'Privacy' },
  { path: '/legal/terms/', label: 'Terms' },
  { path: '/sources/', label: 'Sources' },
  { path: '/sitemap/', label: 'Sitemap' }
] as const

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground md:px-5">
        <nav
          aria-label="Footer"
          className="flex flex-wrap gap-x-4 gap-y-1.5 [&_a:hover]:text-foreground"
        >
          {footerLinks.map(link => (
            <Link key={link.path} href={link.path}>
              {link.label}
            </Link>
          ))}
        </nav>
        <p>
          © {new Date().getFullYear()} {site.name}
        </p>
      </div>
    </footer>
  )
}
