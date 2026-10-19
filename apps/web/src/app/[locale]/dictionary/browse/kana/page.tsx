import { KanaChartsPage } from '@/components/dictionary/browse/hub-pages'
import { browseHubDescription } from '@/lib/dictionary/browse/copy'
import { getBrowseHub } from '@/lib/dictionary/browse/data'
import { kanaChartsPath } from '@/lib/dictionary/browse/paths'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'
import { getDictionary } from '@/lib/i18n/dictionary'
import { localeOf } from '@/lib/i18n/params'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: PageProps<'/[locale]/dictionary/browse/kana'>) {
  const locale = await localeOf(params)
  const { chartsTitle, chartsDescription } = getDictionary(locale).browse.kana
  return dictionaryMetadata(
    kanaChartsPath,
    locale,
    chartsTitle,
    browseHubDescription(chartsDescription, locale)
  )
}

export default async function KanaChartsRoute({
  params
}: PageProps<'/[locale]/dictionary/browse/kana'>) {
  const locale = await localeOf(params)
  const { summary, initials } = await getBrowseHub()
  return <KanaChartsPage summary={summary} initials={initials} locale={locale} />
}
