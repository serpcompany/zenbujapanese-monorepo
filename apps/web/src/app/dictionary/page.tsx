import { notFound } from 'next/navigation'
import { SearchForm } from '@/components/dictionary/search-form'
import { isDictionaryAvailable } from '@/lib/dictionary/data'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'

export const metadata = dictionaryMetadata(
  '/dictionary/',
  'Japanese dictionary',
  'Look up Japanese words and kanji in Japanese, kana, romaji, or English.'
)

export default function DictionaryPage() {
  if (!isDictionaryAvailable()) notFound()
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-5 px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Japanese dictionary</h1>
      <SearchForm autoFocus />
    </main>
  )
}
