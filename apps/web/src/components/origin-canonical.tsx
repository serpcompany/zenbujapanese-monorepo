import type { Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/i18n/paths'
import { homeHeadLinks } from '@/lib/seo'
import { absoluteUrl, siteOrigin } from '@/lib/site'

export function OriginCanonical({ locale }: { locale: Locale }) {
  const origin = siteOrigin()
  const [canonical, ...alternates] = homeHeadLinks(locale, origin)
  return (
    <>
      <link rel="canonical" href={canonical.href} />
      <meta property="og:url" content={absoluteUrl(localizedPath('/', locale), origin)} />
      {alternates.map(link => (
        <link key={link.hrefLang} rel="alternate" hrefLang={link.hrefLang} href={link.href} />
      ))}
    </>
  )
}
