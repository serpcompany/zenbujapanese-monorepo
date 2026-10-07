import { SmartphoneIcon } from 'lucide-react'
import Link from 'next/link'
import { SiteBrand } from '@/components/site-brand'
import { SiteMenu } from '@/components/site-menu'
import { SiteNav } from '@/components/site-nav'
import { Button } from '@/components/ui/button'
import { site } from '@/lib/site'

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4 md:gap-6 md:px-5">
        <SiteBrand nameClassName="max-[359px]:sr-only" />
        <SiteNav />
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button size="lg" nativeButton={false} render={<Link href={site.appUrl} />}>
            <SmartphoneIcon data-icon="inline-start" aria-hidden="true" />
            Get the app
          </Button>
          <SiteMenu />
        </div>
      </div>
    </header>
  )
}
