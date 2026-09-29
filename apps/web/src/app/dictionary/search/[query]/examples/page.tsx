import type { Metadata } from 'next'
import { permanentRedirect } from 'next/navigation'
import { DictionaryBreadcrumbs } from '@/components/dictionary/dictionary-breadcrumbs'
import { SearchExamples } from '@/components/dictionary/search-examples'
import { SourceCredits } from '@/components/dictionary/source-credits'
import { getSearchExamples } from '@/lib/dictionary/data'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'
import { pageSources } from '@/lib/dictionary/sources'
import {
  decodeSegment,
  normalizeSearchQuery,
  searchExamplesPath,
  searchPath
} from '@/lib/dictionary/urls'

type Props = PageProps<'/dictionary/search/[query]/examples'>

/**
 * `/dictionary/search/<query>/examples/`: the Example Sentences page a search's "View N Example
 * Sentences" row opens. Its query follows the search page's URL rules (ADR 0007, #466).
 */
async function load(params: Props['params'], decoded: boolean) {
  const segment = (await params).query
  const raw = decoded ? segment : decodeSegment(segment)
  const query = normalizeSearchQuery(raw)
  if (!query) permanentRedirect('/dictionary/search/')
  if (query !== raw || (!decoded && segment.includes('.'))) {
    permanentRedirect(searchExamplesPath(query))
  }
  return getSearchExamples(query)
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load(params, true)
  return dictionaryMetadata(
    searchExamplesPath(data.query),
    `${data.query} example sentences`,
    data.listed > 0
      ? `${data.listed} Japanese example sentences for “${data.query}”, with translations.`
      : `No Japanese example sentences contain “${data.query}”.`,
    // Indexed when it lists examples, as a search page with results is (ADR 0007).
    { index: data.listed > 0 }
  )
}

export default async function SearchExamplesPage({ params }: Props) {
  const data = await load(params, false)
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-4 pb-6">
      <DictionaryBreadcrumbs
        parent={{ label: `Search: ${data.query}`, path: searchPath(data.query), lang: 'ja' }}
        page={{ label: 'Example sentences', path: searchExamplesPath(data.query) }}
      />
      <SearchExamples data={data} />
      {data.listed > 0 ? <SourceCredits sources={pageSources.searchExamples} /> : null}
    </main>
  )
}
