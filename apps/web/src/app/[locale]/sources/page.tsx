import { creditsShownBy } from '@zenbu/dictionary-core/sources/credits'
import { SourceCreditItem } from '@/components/dictionary/source-credits'
import { PageShell } from '@/components/page-shell'
import { coreText } from '@/lib/i18n/core-text'
import { getDictionary } from '@/lib/i18n/dictionary'
import { fill } from '@/lib/i18n/format'
import { localeOf } from '@/lib/i18n/params'
import { pageMetadata } from '@/lib/metadata'
import { site } from '@/lib/site'

const { conversionNotice, credits } = creditsShownBy('website')

export async function generateMetadata({ params }: PageProps<'/[locale]/sources'>) {
  return pageMetadata('/sources/', await localeOf(params))
}

export default async function SourcesPage({ params }: PageProps<'/[locale]/sources'>) {
  const locale = await localeOf(params)
  return (
    <PageShell path="/sources/" locale={locale}>
      <p>{fill(getDictionary(locale).sources.intro, { name: site.name })}</p>
      <p>{coreText(conversionNotice, locale)}</p>
      <ul className="flex flex-col gap-2">
        {credits.map(source => (
          <SourceCreditItem key={source.id} source={source} locale={locale} />
        ))}
      </ul>
    </PageShell>
  )
}
