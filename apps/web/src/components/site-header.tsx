import Link from 'next/link'
import { isDictionaryAvailable } from '@/lib/dictionary/data'
import { site } from '@/lib/site'

export function SiteHeader() {
  return (
    <header className="border-b">
      <nav className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="font-medium">
          {site.mark} {site.name}
        </Link>
        <div className="flex gap-4 text-sm">
          {isDictionaryAvailable() ? <Link href="/dictionary/">Dictionary</Link> : null}
          <Link href="/about/">About</Link>
          <Link href="/support/">Support</Link>
        </div>
      </nav>
    </header>
  )
}
