import { BrowseHub } from '@/components/dictionary/browse/hub-pages'
import { getBrowseSummary, getKanaInitials } from '@/lib/dictionary/browse/data'
import { browsePath } from '@/lib/dictionary/browse/paths'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'

export const dynamic = 'force-dynamic'

export const metadata = dictionaryMetadata(
  browsePath,
  'Browse the Japanese dictionary',
  'Every Japanese word and kanji in the dictionary, by kana, kanji list, frequency, and category.'
)

export default async function BrowsePage() {
  const [summary, hiragana, katakana] = await Promise.all([
    getBrowseSummary(),
    getKanaInitials('hiragana'),
    getKanaInitials('katakana')
  ])
  return <BrowseHub summary={summary} initials={{ hiragana, katakana }} />
}
