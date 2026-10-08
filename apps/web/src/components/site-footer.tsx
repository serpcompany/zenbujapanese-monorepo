import Link from 'next/link'
import { SiteBrand } from '@/components/site-brand'
import { SocialLinks } from '@/components/social-links'
import { site } from '@/lib/site'
import { footerColumns } from '@/lib/site-footer'

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t bg-muted/40">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10 text-sm md:px-5">
        <div className="grid grid-cols-1 gap-7 md:grid-cols-[1.5fr_repeat(4,minmax(0,1fr))] md:gap-8">
          <div className="flex flex-col gap-3">
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
                  <li key={link.title}>
                    <Link
                      href={link.href}
                      data-link-target={link.target}
                      className="hover:text-foreground"
                    >
                      {link.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <SocialLinks />
        <div className="-mt-2 flex flex-wrap justify-between gap-2 text-muted-foreground">
          <p>
            © {new Date().getFullYear()} {site.name}
          </p>
          <Link href="/sitemap/" className="hover:text-foreground">
            Sitemap
          </Link>
        </div>
      </div>
    </footer>
  )
}
