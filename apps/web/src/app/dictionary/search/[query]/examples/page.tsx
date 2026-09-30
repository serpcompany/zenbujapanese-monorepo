import { japaneseSegments } from '@zenbu/dictionary-core/search/query'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { DictionaryBreadcrumbs } from '@/components/dictionary/dictionary-breadcrumbs'
import { SearchExamples } from '@/components/dictionary/search-examples'
import { SourceCredits } from '@/components/dictionary/source-credits'
import { getSearchExamples } from '@/lib/dictionary/data'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'
import { pageSources } from '@/lib/dictionary/sources'
import { searchExamplesPath, searchPath } from '@/lib/dictionary/urls'
import { searchQuery } from '../query'

// `/dictionary/search/<query>/examples/`: what a search's "View N Example Sentences" row opens,
// as the app's ExampleSentencesView: the query's sentences, or its primary entry's for a romaji or
// deinflected query, with each occurrence of the query accented. Its query follows the search
// page's URL rules (ADR 0007, #466). A search without example sentences has none (404): the app
// never opens an empty screen.

type Props = PageProps<'/dictionary/search/[query]/examples'>

async function load(params: Props['params'], decoded: boolean) {
  const query = await searchQuery(params, decoded, searchExamplesPath)
  const examples = await getSearchExamples(query)
  if (!examples) notFound()
  return examples
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load(params, true)
  return dictionaryMetadata(
    searchExamplesPath(data.query),
    `${data.query} example sentences`,
    `${data.listed} Japanese example sentences for “${data.query}”, with translations.`,
    { index: data.indexable }
  )
}

export default async function SearchExamplesPage({ params }: Props) {
  const data = await load(params, false)
  const lang = japaneseSegments(data.query).length > 0 ? 'ja' : undefined
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-4 pb-6">
      <DictionaryBreadcrumbs
        parent={{ label: `Search: ${data.query}`, path: searchPath(data.query), lang }}
        page={{ label: 'Example sentences', path: searchExamplesPath(data.query) }}
      />
      <SearchExamples data={data} />
      <SourceCredits sources={pageSources.searchExamples} />
    </main>
  )
}
