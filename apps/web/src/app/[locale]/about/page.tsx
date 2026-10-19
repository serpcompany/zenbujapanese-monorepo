import { PageShell } from '@/components/page-shell'
import { getDictionary } from '@/lib/i18n/dictionary'
import { fill } from '@/lib/i18n/format'
import { localeOf } from '@/lib/i18n/params'
import { pageMetadata } from '@/lib/metadata'
import { site } from '@/lib/site'

export async function generateMetadata({ params }: PageProps<'/[locale]/about'>) {
  return pageMetadata('/about/', await localeOf(params))
}

export default async function AboutPage({ params }: PageProps<'/[locale]/about'>) {
  const locale = await localeOf(params)
  return (
    <PageShell path="/about/" locale={locale}>
      <p>{fill(getDictionary(locale).about.body, { name: site.name })}</p>
    </PageShell>
  )
}
