import { PageList } from '@/components/page-list'
import { localeOf } from '@/lib/i18n/params'
import { pageMetadata } from '@/lib/metadata'
import { legalPagesIn } from '@/lib/pages'

export async function generateMetadata({ params }: PageProps<'/[locale]/legal'>) {
  return pageMetadata('/legal/', await localeOf(params))
}

export default async function LegalPage({ params }: PageProps<'/[locale]/legal'>) {
  const locale = await localeOf(params)
  return <PageList path="/legal/" pages={legalPagesIn(locale)} locale={locale} />
}
