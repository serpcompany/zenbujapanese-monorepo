import { ChevronRightIcon, SearchIcon } from 'lucide-react'
import Link from 'next/link'
import { Fragment, type ReactNode } from 'react'
import { FrequencyBadges } from '@/components/dictionary/frequency'
import { RubyText } from '@/components/dictionary/ruby-text'
import { Card } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Item, ItemActions, ItemContent, ItemGroup, ItemSeparator } from '@/components/ui/item'
import type { SearchData, SearchWord } from '@/lib/dictionary/data'

// The search results screen as SearchView.swift's `SearchResultsView` lays it out: the
// "Search for「…」" reading refinement, then one list whose first row is the kanji row for a
// one-kanji query, then the words in the app's order. It only renders `SearchData`
// (src/lib/dictionary/results), so search-results.test.tsx renders it without a server.

/** A row that opens `path`, or plain text when there is no page yet (#465). */
function Row({
  path,
  label,
  children
}: {
  path: string | null
  label?: string
  children: ReactNode
}) {
  return (
    <Item
      render={path ? <Link href={path} aria-label={label} /> : undefined}
      className="rounded-none px-4"
    >
      {children}
      {path ? (
        <ItemActions>
          <ChevronRightIcon className="size-4 text-muted-foreground" />
        </ItemActions>
      ) : null}
    </Item>
  )
}

/** `ResultRow`: headword with furigana, the meaning clamped to two lines, and the chips. */
function WordRow({ word }: { word: SearchWord }) {
  return (
    <Row path={word.path}>
      <ItemContent className="gap-1.5" data-result-row={word.entSeq}>
        <RubyText segments={word.ruby} className="text-2xl font-medium leading-tight" />
        <p className="line-clamp-2 text-sm">{word.summary}</p>
        <FrequencyBadges frequency={word.chips} />
      </ItemContent>
    </Row>
  )
}

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
  const { query, kanji, rows, readingRefinement } = data
  const discovered = data.sections.includes('discoveredWords')
  return (
    <>
      <p className="text-sm text-muted-foreground">
        {rows.length} {rows.length === 1 ? 'word' : 'words'} for{' '}
        <span lang="ja" className="text-foreground">
          {query}
        </span>
      </p>
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
          {rows.map((word, position) => (
            <Fragment key={word.id}>
              {position > 0 || kanji ? <ItemSeparator className="my-0" /> : null}
              <WordRow word={word} />
            </Fragment>
          ))}
        </ItemGroup>
      </Card>
    </>
  )
}
