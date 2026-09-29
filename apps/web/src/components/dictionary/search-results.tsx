import { SearchIcon } from 'lucide-react'
import { ResultRows, Row } from '@/components/dictionary/search-result-rows'
import { Card } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { ItemContent, ItemGroup } from '@/components/ui/item'
import type { SearchData } from '@/lib/dictionary/data'

// The search results screen as SearchView.swift's `SearchResultsView` lays it out: the "View N
// Example Sentences" row, the "Search for「…」" reading refinement, then one list whose first row
// is the kanji row for a one-kanji query, then the words in the app's order, the first
// `resultsPerPage` with the page and the rest as it scrolls (#466). It only renders `SearchData`
// (src/lib/dictionary/results), so search-results.test.tsx renders it without a server.

/** SearchView.swift's no-results state. */
function NoResults() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchIcon />
        </EmptyMedia>
        <EmptyTitle>No Dictionary Matches</EmptyTitle>
        <EmptyDescription>Try another Japanese or English Search query.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

export function SearchResults({ data }: { data: SearchData }) {
  if (data.state === 'noResults') return <NoResults />
  const { query, kanji, rows, readingRefinement, examples, wordCount } = data
  const discovered = data.sections.includes('discoveredWords')
  const listed = data.sections.includes('results') || discovered
  return (
    <>
      <p className="text-sm text-muted-foreground">
        {wordCount} {wordCount === 1 ? 'word' : 'words'} for{' '}
        <span lang="ja" className="text-foreground">
          {query}
        </span>
      </p>
      {examples ? (
        <Card className="py-0" data-section="examples">
          <Row path={examples.path}>
            <ItemContent>
              <p className="font-semibold">{examples.title}</p>
            </ItemContent>
          </Row>
        </Card>
      ) : null}
      {readingRefinement ? (
        <Card className="py-0" data-section="readingRefinement">
          <Row
            path={readingRefinement.path}
            label={`Search for Japanese reading ${readingRefinement.query}`}
          >
            <ItemContent>
              <p className="font-semibold">
                Search for「<span lang="ja">{readingRefinement.query}</span>」
              </p>
            </ItemContent>
          </Row>
        </Card>
      ) : null}
      {listed ? (
        <Card className="py-2" data-section={discovered ? 'discoveredWords' : 'results'}>
          <ItemGroup className="gap-0">
            {discovered ? <h2 className="px-4 py-2 font-semibold">Discovered Words</h2> : null}
            {kanji ? (
              <Row path={kanji.path}>
                <span lang="ja" className="text-4xl font-light">
                  {kanji.character}
                </span>
                <ItemContent className="gap-0.5" data-kanji-row={kanji.character}>
                  <p className="text-xs font-bold">{kanji.label}</p>
                  <p>{kanji.summary}</p>
                </ItemContent>
              </Row>
            ) : null}
            <ResultRows
              initial={rows}
              total={wordCount}
              path={data.rowsPath}
              afterKanji={kanji !== null}
            />
          </ItemGroup>
        </Card>
      ) : null}
    </>
  )
}
