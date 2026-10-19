import { BrowseHub } from '@/components/dictionary/browse/hub-pages'
import { browseHubDescription } from '@/lib/dictionary/browse/copy'
import { getBrowseHub } from '@/lib/dictionary/browse/data'
import { browsePath } from '@/lib/dictionary/browse/paths'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'
import { getDictionary } from '@/lib/i18n/dictionary'
import { localeOf } from '@/lib/i18n/params'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: PageProps<'/[locale]/dictionary/browse'>) {
  const locale = await localeOf(params)
  const { title, description } = getDictionary(locale).browse.hub
  return dictionaryMetadata(browsePath, locale, title, browseHubDescription(description, locale))
}

export default async function BrowsePage({ params }: PageProps<'/[locale]/dictionary/browse'>) {
  const locale = await localeOf(params)
  const { summary, initials } = await getBrowseHub()
  return <BrowseHub summary={summary} initials={initials} locale={locale} />
}
