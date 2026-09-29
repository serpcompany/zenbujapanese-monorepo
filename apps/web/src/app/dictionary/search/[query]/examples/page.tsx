import { exampleCountText } from '@zenbu/dictionary-core/detail/examples'
import { japaneseSegments } from '@zenbu/dictionary-core/search/query'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { DictionaryBreadcrumbs } from '@/components/dictionary/dictionary-breadcrumbs'
import { ExampleList } from '@/components/dictionary/example-list'
import { SourceCredits } from '@/components/dictionary/source-credits'
import { getSearchExamples } from '@/lib/dictionary/data'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'
import { pageSources } from '@/lib/dictionary/sources'
import { searchExamplesPath, searchPath } from '@/lib/dictionary/urls'
import { searchQuery } from '../query'

// What a search's Example Sentences row opens, as the app's ExampleSentencesView: the query's
// sentences, or its primary entry's for a romaji or deinflected query, with each occurrence of the
// query accented. The first ones render with the page; the rest load as it scrolls.

type Props = PageProps<'/dictionary/search/[query]/examples'>

async function load(params: Props['params'], decoded: boolean) {
  const query = await searchQuery(params, decoded, searchExamplesPath)
  const examples = await getSearchExamples(query)
  if (!examples) notFound()
  return examples
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { query } = await load(params, true)
  // Kept out of search engines: they index the results page, and the words' own pages.
  return dictionaryMetadata(
    searchExamplesPath(query),
    `${query} in Japanese example sentences`,
    `Japanese example sentences for “${query}”, with English translations.`,
    { index: false }
  )
}

export default async function SearchExamplesPage({ params }: Props) {
  const data = await load(params, false)
  // Marked as Japanese only when it has Japanese in it: "eat" is read as English.
  const lang = japaneseSegments(data.query).length > 0 ? 'ja' : undefined
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-4 pb-6">
      <DictionaryBreadcrumbs
        parent={{ label: `Search: ${data.query}`, path: searchPath(data.query), lang }}
        page={{ label: 'Example sentences', path: searchExamplesPath(data.query) }}
      />
      <div className="flex flex-col gap-1">
        <h1 lang={lang} className="text-2xl font-semibold">
          {data.query}
        </h1>
        <p className="text-sm text-muted-foreground">{exampleCountText(data)}</p>
      </div>
      <ExampleList initial={data.examples} listed={data.listed} path={data.examplesPath} />
      <SourceCredits sources={pageSources.examples} />
    </main>
  )
}
