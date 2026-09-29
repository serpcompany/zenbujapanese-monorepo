import { QuoteIcon } from 'lucide-react'
import { ExampleList } from '@/components/dictionary/example-list'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import type { SearchExamplesData } from '@/lib/dictionary/data'
import { exampleCountText } from '@/lib/dictionary/detail/examples'

// A search's Example Sentences page, as ExampleSentencesView.swift lists them: titled with the
// query, then each sentence with its words linked, the query's words marked, a speaker, the
// translation, and its Tatoeba credit, in the app's order, up to its 100. The first ones render
// with the page and the rest load as it scrolls, as a word page's examples do (#464). It only
// renders `SearchExamplesData`, so search-examples.test.tsx renders it without a server.

export function SearchExamples({ data }: { data: SearchExamplesData }) {
  const count = exampleCountText({ listed: data.listed, count: 0, truncated: data.truncated })
  return (
    <section className="flex flex-col gap-3" data-section="searchExamples">
      <h1 lang="ja" className="text-2xl font-semibold">
        {data.query}
      </h1>
      {count ? <p className="text-sm text-muted-foreground">{count}</p> : null}
      {data.listed > 0 ? (
        <ExampleList initial={data.examples} listed={data.listed} path={data.examplesPath} />
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <QuoteIcon />
            </EmptyMedia>
            <EmptyTitle>No Example Sentences</EmptyTitle>
            <EmptyDescription>
              No example sentence contains <span lang="ja">{data.query}</span>.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </section>
  )
}
