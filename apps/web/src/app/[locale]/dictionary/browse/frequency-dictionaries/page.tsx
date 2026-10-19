import { FrequencyHubPage } from '@/components/dictionary/browse/frequency-pages'
import { getRankedLists } from '@/lib/dictionary/browse/data'
import { frequencyDictionariesPath } from '@/lib/dictionary/browse/paths'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'
import { getDictionary } from '@/lib/i18n/dictionary'
import { localeOf } from '@/lib/i18n/params'

export const dynamic = 'force-dynamic'

type Props = PageProps<'/[locale]/dictionary/browse/frequency-dictionaries'>

export async function generateMetadata({ params }: Props) {
  const locale = await localeOf(params)
  const { title, description } = getDictionary(locale).browse.frequency
  return dictionaryMetadata(frequencyDictionariesPath, locale, title, description)
}

export default async function FrequencyDictionariesPage({ params }: Props) {
  const locale = await localeOf(params)
  return <FrequencyHubPage ranked={await getRankedLists()} locale={locale} />
}
