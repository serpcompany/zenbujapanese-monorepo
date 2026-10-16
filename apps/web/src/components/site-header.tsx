import { AccountMenu } from '@/components/account-menu'
import { LanguageMenu } from '@/components/language-switcher'
import { GetAppButton } from '@/components/site-actions'
import { SiteBrand } from '@/components/site-brand'
import { SiteMenu } from '@/components/site-menu'
import { SiteNav } from '@/components/site-nav'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { switcherFor } from '@/lib/i18n/switcher'
import { siteMenusIn } from '@/lib/site-menus'

export function SiteHeader({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).chrome
  const menus = siteMenusIn(locale)
  const switcher = switcherFor(locale)
  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4 md:px-5 lg:gap-6">
        <SiteBrand locale={locale} nameClassName="max-lg:sr-only" />
        <SiteNav menus={menus} label={t.mainNav} />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <LanguageMenu {...switcher} className="max-lg:hidden" />
          <GetAppButton locale={locale} label={t.getTheApp} size="lg" className="max-lg:hidden" />
          <AccountMenu locale={locale} text={t.account} theme={t.theme} className="max-lg:hidden" />
          <SiteMenu locale={locale} menus={menus} text={t} switcher={switcher} />
        </div>
      </div>
    </header>
  )
}
