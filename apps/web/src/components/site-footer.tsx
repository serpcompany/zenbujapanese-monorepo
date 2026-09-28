import Link from 'next/link'
import { legalPages } from '@/lib/pages'
import { site } from '@/lib/site'

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground">
        <nav className="flex flex-wrap gap-x-4 gap-y-2">
          <Link href="/contact">Contact</Link>
          {legalPages.map(page => (
            <Link key={page.path} href={page.path}>
              {page.title}
            </Link>
          ))}
          <Link href="/sitemap">Sitemap</Link>
        </nav>
        <p>
          © {new Date().getFullYear()} {site.name}
        </p>
      </div>
    </footer>
  )
}
