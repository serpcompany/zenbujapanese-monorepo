import { KanjiHubPage } from '@/components/dictionary/browse/kanji-pages'
import { getBrowseSummary, getKanjiHub } from '@/lib/dictionary/browse/data'
import { kanjiListsPath } from '@/lib/dictionary/browse/paths'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'

export const dynamic = 'force-dynamic'

export const metadata = dictionaryMetadata(
  kanjiListsPath,
  'Kanji lists by school grade, JLPT level, and stroke count',
  'Every jōyō kanji by school grade and stroke count, the jinmeiyō kanji used in names, and the kanji of each JLPT level, each with its readings, stroke order, and words.'
)

export default async function KanjiListsPage() {
  const [hub, summary] = await Promise.all([getKanjiHub(), getBrowseSummary()])
  return <KanjiHubPage hub={hub} joyo={summary.kanji.joyo} />
}
