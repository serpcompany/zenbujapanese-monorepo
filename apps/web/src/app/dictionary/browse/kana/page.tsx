import { KanaChartsPage } from '@/components/dictionary/browse/hub-pages'
import { getBrowseSummary } from '@/lib/dictionary/browse/data'
import { kanaChartsPath } from '@/lib/dictionary/browse/paths'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'

export const dynamic = 'force-dynamic'

export const metadata = dictionaryMetadata(
  kanaChartsPath,
  'Hiragana and katakana charts',
  'The hiragana and katakana charts with romaji, each kana opening every Japanese word that starts with it.'
)

export default async function KanaChartsRoute() {
  return <KanaChartsPage summary={await getBrowseSummary()} />
}
