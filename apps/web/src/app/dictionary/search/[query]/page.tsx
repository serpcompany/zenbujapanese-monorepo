import type { Metadata } from 'next'
import { DictionaryBreadcrumbs } from '@/components/dictionary/dictionary-breadcrumbs'
import { SearchForm } from '@/components/dictionary/search-form'
import { SearchResults } from '@/components/dictionary/search-results'
import { SourceCredits } from '@/components/dictionary/source-credits'
import { getSearchExamples, searchDictionary } from '@/lib/dictionary/data'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'
import { isIndexable } from '@/lib/dictionary/results/links'
import { pageSources, withShownData } from '@/lib/dictionary/sources'
import { searchPath } from '@/lib/dictionary/urls'
import { searchQuery } from './query'

type Props = PageProps<'/dictionary/search/[query]'>

async function load(params: Props['params'], decoded: boolean) {
  return searchDictionary(await searchQuery(params, decoded, searchPath))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const results = await load(params, true)
  return dictionaryMetadata(
    searchPath(results.query),
    `${results.query} in Japanese`,
    results.state === 'results' && results.rows.length > 0
      ? `${results.rows.length} Japanese words for “${results.query}”, with readings and meanings.`
      : `No Japanese words match “${results.query}”.`,
    { index: isIndexable(results) }
  )
}

export default async function SearchResultsPage({ params }: Props) {
  const data = await load(params, false)
  const examples =
    data.state === 'results' && data.examples?.target.kind === 'inline'
      ? await getSearchExamples(data.query)
      : null
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-4 pb-6">
      <DictionaryBreadcrumbs
        page={{ label: `Search: ${data.query}`, path: searchPath(data.query), lang: 'ja' }}
      />
      <SearchForm defaultValue={data.query} />
      <SearchResults data={data} examples={examples} />
      {data.state === 'results' ? (
        <SourceCredits
          sources={withShownData(pageSources.search, {
            kanji: data.kanji?.details ? [data.kanji.details] : [],
            examples: examples !== null
          })}
        />
      ) : null}
    </main>
  )
}
