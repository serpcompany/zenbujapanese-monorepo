import type { Metadata } from 'next'
import { permanentRedirect } from 'next/navigation'
import { DictionaryBreadcrumbs } from '@/components/dictionary/dictionary-breadcrumbs'
import { SearchForm } from '@/components/dictionary/search-form'
import { SearchResults } from '@/components/dictionary/search-results'
import { SourceCredits } from '@/components/dictionary/source-credits'
import { searchDictionary } from '@/lib/dictionary/data'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'
import { isIndexable } from '@/lib/dictionary/results/links'
import { pageSources } from '@/lib/dictionary/sources'
import { decodeSegment, normalizeSearchQuery, searchPath } from '@/lib/dictionary/urls'

type Props = PageProps<'/dictionary/search/[query]'>

// Next.js passes the page an encoded segment but generateMetadata a decoded one.
async function load(params: Props['params'], decoded: boolean) {
  const segment = (await params).query
  const raw = decoded ? segment : decodeSegment(segment)
  const query = normalizeSearchQuery(raw)
  if (!query) permanentRedirect('/dictionary/search/')
  // A literal dot (3.14) redirects to its encoded form (3%2E14), which keeps the trailing slash.
  if (query !== raw || (!decoded && segment.includes('.'))) permanentRedirect(searchPath(query))
  return searchDictionary(query)
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const results = await load(params, true)
  return dictionaryMetadata(
    searchPath(results.query),
    `${results.query} in Japanese`,
    results.state === 'results' && results.wordCount > 0
      ? `${results.wordCount} Japanese words for “${results.query}”, with readings and meanings.`
      : `No Japanese words match “${results.query}”.`,
    { index: isIndexable(results) }
  )
}

export default async function SearchResultsPage({ params }: Props) {
  const data = await load(params, false)
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-4 pb-6">
      <DictionaryBreadcrumbs
        page={{ label: `Search: ${data.query}`, path: searchPath(data.query), lang: 'ja' }}
      />
      <SearchForm defaultValue={data.query} />
      <SearchResults data={data} />
      {data.state === 'results' ? <SourceCredits sources={pageSources.search} /> : null}
    </main>
  )
}
