import Link from 'next/link'
import { isDictionaryAvailable } from '@/lib/dictionary/data'
import { legalPages } from '@/lib/pages'
import { site } from '@/lib/site'

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground md:px-5">
        <nav className="flex flex-wrap gap-x-4 gap-y-1.5 [&_a:hover]:text-foreground">
          {isDictionaryAvailable() ? <Link href="/dictionary/">Dictionary</Link> : null}
          {/* The header hides these on phones. */}
          <Link href="/about/" className="md:hidden">
            About
          </Link>
          <Link href="/support/" className="md:hidden">
            Support
          </Link>
          <Link href="/contact/">Contact</Link>
          {legalPages.map(page => (
            <Link key={page.path} href={page.path}>
              {page.title}
            </Link>
          ))}
          <Link href="/sources/">Sources</Link>
          <Link href="/sitemap/">Sitemap</Link>
        </nav>
        <p>
          © {new Date().getFullYear()} {site.name}
        </p>
      </div>
    </footer>
  )
}
