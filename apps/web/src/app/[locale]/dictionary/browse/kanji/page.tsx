import { KanjiHubPage } from '@/components/dictionary/browse/kanji-pages'
import { getBrowseSummary, getKanjiHub } from '@/lib/dictionary/browse/data'
import { kanjiListsPath } from '@/lib/dictionary/browse/paths'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'
import { getDictionary } from '@/lib/i18n/dictionary'
import { localeOf } from '@/lib/i18n/params'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: PageProps<'/[locale]/dictionary/browse/kanji'>) {
  const locale = await localeOf(params)
  const { hubTitle, hubDescription } = getDictionary(locale).browse.kanji
  return dictionaryMetadata(kanjiListsPath, locale, hubTitle, hubDescription)
}

export default async function KanjiListsPage({
  params
}: PageProps<'/[locale]/dictionary/browse/kanji'>) {
  const locale = await localeOf(params)
  const [hub, summary] = await Promise.all([getKanjiHub(), getBrowseSummary()])
  return <KanjiHubPage hub={hub} joyo={summary.kanji.joyo} locale={locale} />
}
