import { BrowseHub } from '@/components/dictionary/browse/hub-pages'
import { getBrowseSummary } from '@/lib/dictionary/browse/data'
import { browsePath } from '@/lib/dictionary/browse/paths'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'

export const dynamic = 'force-dynamic'

export const metadata = dictionaryMetadata(
  browsePath,
  'Browse the Japanese dictionary',
  'Every Japanese word and kanji in the dictionary, by kana, kanji list, frequency, and category.'
)

export default async function BrowsePage() {
  return <BrowseHub summary={await getBrowseSummary()} />
}
