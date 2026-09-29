import { DictionaryBreadcrumbs } from '@/components/dictionary/dictionary-breadcrumbs'
import { SearchForm } from '@/components/dictionary/search-form'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'

export const metadata = dictionaryMetadata(
  '/dictionary/',
  'Japanese dictionary',
  'Look up Japanese words and kanji in Japanese, kana, romaji, or English.'
)

export default function DictionaryPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pt-4 pb-6">
      <DictionaryBreadcrumbs />
      {/* Centered a little above the middle, where the eye lands first. */}
      <section className="flex flex-1 flex-col items-center justify-center gap-8 pt-10 pb-[12vh] text-center">
        <div className="flex flex-col items-center gap-4">
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Japanese dictionary
          </h1>
          <p className="max-w-lg text-lg text-balance text-muted-foreground">
            Words and kanji with readings, meanings, pitch accent, and examples. Search in Japanese,
            kana, romaji, or English.
          </p>
        </div>
        <div className="w-full max-w-xl">
          <SearchForm autoFocus />
        </div>
      </section>
    </main>
  )
}
