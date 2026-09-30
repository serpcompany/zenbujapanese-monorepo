import { exampleCountText } from '@zenbu/dictionary-core/detail/examples'
import { japaneseSegments } from '@zenbu/dictionary-core/search/query'
import { ExampleList } from '@/components/dictionary/example-list'
import type { SearchExamplesData } from '@/lib/dictionary/data'

// A search's Example Sentences page, as ExampleSentencesView.swift lists them: titled with the
// query and how many there are, then each sentence with its words linked, the query's words
// marked, a speaker, the translation, and its Tatoeba credit, in the app's order, up to its 100.
// The first ones render with the page and the rest load as it scrolls, as a word page's examples
// do. It only renders `SearchExamplesData`, so search-examples.test.tsx renders it without a
// server.

export function SearchExamples({ data }: { data: SearchExamplesData }) {
  // Marked as Japanese only when it has Japanese in it: "eat" is read as English.
  const lang = japaneseSegments(data.query).length > 0 ? 'ja' : undefined
  return (
    <section className="flex flex-col gap-4" data-section="searchExamples">
      <div className="flex flex-col gap-1">
        <h1 lang={lang} className="text-2xl font-semibold">
          {data.query}
        </h1>
        <p className="text-sm text-muted-foreground">{exampleCountText(data)}</p>
      </div>
      <ExampleList initial={data.examples} listed={data.listed} path={data.examplesPath} />
    </section>
  )
}
