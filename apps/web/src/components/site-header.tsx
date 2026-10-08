import { GetAppButton, LogInButton } from '@/components/site-actions'
import { SiteBrand } from '@/components/site-brand'
import { SiteMenu } from '@/components/site-menu'
import { SiteNav } from '@/components/site-nav'

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4 md:px-5 lg:gap-6">
        <SiteBrand nameClassName="max-lg:sr-only" />
        <SiteNav />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <LogInButton variant="ghost" size="lg" className="max-lg:hidden" />
          <GetAppButton size="lg" className="max-lg:hidden" />
          <SiteMenu />
        </div>
      </div>
    </header>
  )
}
