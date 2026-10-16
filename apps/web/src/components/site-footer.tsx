import Link from 'next/link'
import { AccountFooterLink } from '@/components/account/account-footer-link'
import { LanguageMenu } from '@/components/language-switcher'
import { SiteBrand } from '@/components/site-brand'
import { SocialLinks } from '@/components/social-links'
import { accountPagesOpen } from '@/lib/account/availability'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { fill } from '@/lib/i18n/format'
import { localizedPath } from '@/lib/i18n/paths'
import { switcherFor } from '@/lib/i18n/switcher'
import { site } from '@/lib/site'
import { footerColumnsIn } from '@/lib/site-footer'

export function SiteFooter({ locale }: { locale: Locale }) {
  const t = getDictionary(locale)
  return (
    <footer className="muted-surface mt-auto border-t bg-muted dark:bg-muted/40">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10 text-sm md:px-5">
        <div className="grid grid-cols-1 gap-7 md:grid-cols-[1.5fr_repeat(4,minmax(0,1fr))] md:gap-8">
          <div className="flex flex-col gap-3">
            <SiteBrand locale={locale} className="self-start" />
            <p className="max-w-xs text-muted-foreground">{t.site.description}</p>
          </div>
          {footerColumnsIn(locale).map(column => (
            <nav key={column.id} aria-labelledby={`footer-${column.id}`}>
              <h2 id={`footer-${column.id}`} className="font-medium">
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
                {column.account && accountPagesOpen() ? (
                  <li>
                    <AccountFooterLink
                      locale={locale}
                      text={t.footer.account}
                      className="hover:text-foreground"
                    />
                  </li>
                ) : null}
              </ul>
            </nav>
          ))}
        </div>
        <SocialLinks locale={locale} />
        <div className="-mt-2 flex flex-wrap items-center justify-between gap-2 text-muted-foreground">
          <p>{fill(t.footer.copyright, { year: new Date().getFullYear(), name: site.name })}</p>
          <div className="flex flex-wrap items-center gap-2">
            <LanguageMenu {...switcherFor(locale)} side="top" className="-my-2" />
            <Link href={localizedPath('/sitemap/', locale)} className="hover:text-foreground">
              {t.footer.sitemap}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
