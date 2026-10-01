import { SmartphoneIcon } from 'lucide-react'
import Link from 'next/link'
import { HeaderSearchField, HeaderSearchLink } from '@/components/header-search'
import { SiteNav } from '@/components/site-nav'
import { Button } from '@/components/ui/button'
import { site } from '@/lib/site'

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4 md:px-5">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-medium">
          <span
            lang="ja"
            aria-hidden="true"
            className="grid size-7 place-items-center rounded-md bg-primary text-[15px] text-primary-foreground"
          >
            {site.mark}
          </span>
          <span className="max-md:sr-only">{site.name}</span>
        </Link>
        <div className="flex min-w-0 flex-1">
          <HeaderSearchField />
        </div>
        <SiteNav />
        <div className="flex shrink-0 items-center gap-1">
          <HeaderSearchLink />
          <Button size="lg" nativeButton={false} render={<Link href={site.appUrl} />}>
            <SmartphoneIcon data-icon="inline-start" aria-hidden="true" />
            Get the app
          </Button>
        </div>
      </div>
    </header>
  )
}
