import { ExampleList } from '@/components/dictionary/example-list'
import type { SearchExamplesData } from '@/lib/dictionary/data'

// A search's Example Sentences page, as ExampleSentencesView.swift lists them: titled with the
// query, with no count, then each sentence with its words linked, the query's words marked, a
// speaker, the translation, and its Tatoeba credit, in the app's order, up to its 100. The first
// ones render with the page and the rest load as it scrolls, as a word page's examples do (#464).
// It only renders `SearchExamplesData`, so search-examples.test.tsx renders it without a server.

export function SearchExamples({ data }: { data: SearchExamplesData }) {
  return (
    <section className="flex flex-col gap-3" data-section="searchExamples">
      <h1 lang="ja" className="text-2xl font-semibold">
        {data.query}
      </h1>
      <ExampleList initial={data.examples} listed={data.listed} path={data.examplesPath} />
    </section>
  )
}
