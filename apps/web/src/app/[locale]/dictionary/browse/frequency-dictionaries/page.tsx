import { FrequencyHubPage } from '@/components/dictionary/browse/frequency-pages'
import { getRankedLists } from '@/lib/dictionary/browse/data'
import { frequencyDictionariesPath } from '@/lib/dictionary/browse/paths'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'

export const dynamic = 'force-dynamic'

export const metadata = dictionaryMetadata(
  frequencyDictionariesPath,
  'Japanese frequency dictionaries',
  'The JLPT vocabulary lists, and Japanese words ranked by how often they’re used on YouTube, on Wikipedia, and in TV, anime, manga, novels, visual novels, and video games.'
)

export default async function FrequencyDictionariesPage() {
  return <FrequencyHubPage ranked={await getRankedLists()} />
}
