import Link from 'next/link'
import { SiteBrand } from '@/components/site-brand'
import { legalPages } from '@/lib/pages'
import { site } from '@/lib/site'

type FooterLink = { path: string; title: string }

const footerColumns: { heading: string; links: readonly FooterLink[] }[] = [
  {
    heading: 'Product',
    links: [
      { path: '/dictionary/', title: 'Dictionary' },
      { path: '/sources/', title: 'Sources' },
      { path: '/sitemap/', title: 'Sitemap' }
    ]
  },
  {
    heading: 'Company',
    links: [
      { path: '/about/', title: 'About' },
      { path: '/support/', title: 'Support' },
      { path: '/contact/', title: 'Contact' }
    ]
  },
  {
    heading: 'Policies',
    links: [{ path: '/legal/', title: 'Legal' }, ...legalPages]
  }
]

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t bg-muted/40">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10 text-sm md:px-5">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-[1.5fr_repeat(3,1fr)]">
          <div className="col-span-2 flex flex-col gap-3 md:col-span-1">
            <SiteBrand className="self-start" />
            <p className="max-w-xs text-muted-foreground">{site.description}</p>
          </div>
          {footerColumns.map(column => (
            <nav key={column.heading} aria-labelledby={`footer-${column.heading}`}>
              <h2 id={`footer-${column.heading}`} className="font-medium">
                {column.heading}
              </h2>
              <ul className="mt-3 flex flex-col gap-2 text-muted-foreground">
                {column.links.map(link => (
                  <li key={link.path}>
                    <Link href={link.path} className="hover:text-foreground">
                      {link.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <p className="border-t pt-6 text-muted-foreground">
          © {new Date().getFullYear()} {site.name}
        </p>
      </div>
    </footer>
  )
}
