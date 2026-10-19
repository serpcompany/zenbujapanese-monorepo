import { PageShell } from '@/components/page-shell'
import { defaultLocale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { fill } from '@/lib/i18n/format'
import { localeOf } from '@/lib/i18n/params'
import { pageMetadata } from '@/lib/metadata'
import { site } from '@/lib/site'

const path = '/legal/affiliate-disclosure/'

export async function generateMetadata({
  params
}: PageProps<'/[locale]/legal/affiliate-disclosure'>) {
  return pageMetadata(path, await localeOf(params))
}

export default async function AffiliateDisclosurePage({
  params
}: PageProps<'/[locale]/legal/affiliate-disclosure'>) {
  const locale = await localeOf(params)
  const t = getDictionary(locale).affiliate
  return (
    <PageShell path={path} locale={locale} updated="2026-09-28" englishPrevails>
      <p>{fill(t.links, { name: site.name })}</p>
      {locale === defaultLocale ? null : <p>{t.japaneseLaw}</p>}
      <p>{fill(t.independence, { name: site.name })}</p>
    </PageShell>
  )
}
