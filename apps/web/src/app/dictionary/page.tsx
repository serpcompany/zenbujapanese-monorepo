import { DictionaryHomeSections } from '@/components/dictionary/browse/home-sections'
import { DictionaryBreadcrumbs } from '@/components/dictionary/dictionary-breadcrumbs'
import { SearchForm } from '@/components/dictionary/search-form'
import { getBrowseSummaryIfAvailable } from '@/lib/dictionary/browse/data'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'

export const dynamic = 'force-dynamic'

export const metadata = dictionaryMetadata(
  '/dictionary/',
  'Japanese dictionary',
  'Look up Japanese words and kanji in Japanese, kana, romaji, or English.'
)

export default async function DictionaryPage() {
  const summary = await getBrowseSummaryIfAvailable()
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 pt-4 pb-16 md:px-5">
      <DictionaryBreadcrumbs />
      <section className="mx-auto flex min-h-[70svh] w-full max-w-2xl flex-col items-center justify-center gap-8 pt-10 pb-[12vh] text-center">
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
      {summary ? <DictionaryHomeSections summary={summary} /> : null}
    </main>
  )
}
