import { notFound, permanentRedirect } from 'next/navigation'
import { DictionaryBreadcrumbs } from '@/components/dictionary/dictionary-breadcrumbs'
import { SearchForm } from '@/components/dictionary/search-form'
import { isDictionaryAvailable } from '@/lib/dictionary/data'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'
import { hasSearchPath, normalizeSearchQuery, searchPath } from '@/lib/dictionary/urls'

export const metadata = dictionaryMetadata(
  '/dictionary/search/',
  'Search the dictionary',
  'Search Japanese words and kanji in Japanese, kana, romaji, or English.',
  { index: false }
)

/** The search box submits here with ?q=; each search then lives at its own path. */
export default async function SearchIndexPage({ searchParams }: PageProps<'/dictionary/search'>) {
  if (!isDictionaryAvailable()) notFound()
  const { q } = await searchParams
  const query = normalizeSearchQuery(typeof q === 'string' ? q : '')
  if (query && hasSearchPath(query)) permanentRedirect(searchPath(query))
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-4 pb-6">
      <DictionaryBreadcrumbs page={{ label: 'Search', path: '/dictionary/search/' }} />
      <SearchForm autoFocus defaultValue={query || undefined} />
      <h1 className="text-2xl font-semibold tracking-tight">Search the dictionary</h1>
      {/* `.` and `..` can't have a path of their own, so they stay here as finding nothing. */}
      {query ? <p className="text-muted-foreground">No words match “{query}”.</p> : null}
    </main>
  )
}
