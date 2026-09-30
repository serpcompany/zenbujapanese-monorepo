import { exampleCountText } from '@zenbu/dictionary-core/detail/examples'
import { japaneseSegments } from '@zenbu/dictionary-core/search/query'
import { ExampleList } from '@/components/dictionary/example-list'
import type { SearchExamplesData } from '@/lib/dictionary/data'

export function SearchExamples({ data }: { data: SearchExamplesData }) {
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
