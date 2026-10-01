import { exampleCountText } from '@zenbu/dictionary-core/detail/examples'
import { ChevronRightIcon, SearchIcon } from 'lucide-react'
import Link from 'next/link'
import { Fragment, type ReactNode } from 'react'
import { Disclosure } from '@/components/dictionary/disclosure'
import { ExampleList } from '@/components/dictionary/example-list'
import { FrequencyBadges } from '@/components/dictionary/frequency'
import { KanjiDetails } from '@/components/dictionary/kanji-details'
import { RubyText } from '@/components/dictionary/ruby-text'
import { Card } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Item, ItemActions, ItemContent, ItemGroup, ItemSeparator } from '@/components/ui/item'
import type { SearchData, SearchExamplesData, SearchWord } from '@/lib/dictionary/data'

export const searchExamplesAnchor = 'examples'

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

function KanjiRow({
  kanji
}: {
  kanji: NonNullable<Extract<SearchData, { state: 'results' }>['kanji']>
}) {
  const summary = (
    <>
      <span lang="ja" className="text-4xl font-light">
        {kanji.character}
      </span>
      <span className="flex flex-col gap-0.5" data-kanji-row={kanji.character}>
        <span className="text-xs font-bold">{kanji.label}</span>
        <span>{kanji.summary}</span>
      </span>
    </>
  )
  return kanji.details ? (
    <Disclosure
      label={`${kanji.character}, kanji, ${kanji.summary}, shows kanji details`}
      buttonClassName="rounded-none px-4 py-3"
      summary={summary}
    >
      <div className="px-4 pt-2 pb-4">
        <KanjiDetails kanji={kanji.details} />
      </div>
    </Disclosure>
  ) : (
    <div className="flex items-center gap-3 px-4 py-3">{summary}</div>
  )
}

export function SearchExamplesSection({ data }: { data: SearchExamplesData }) {
  return (
    <Card id={searchExamplesAnchor} className="scroll-mt-4 px-4" data-section="searchExamples">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold">Example Sentences</h2>
        <p className="text-sm text-muted-foreground">{exampleCountText(data)}</p>
      </div>
      <ExampleList initial={data.examples} listed={data.listed} path={data.examplesPath} />
    </Card>
  )
}

export function SearchResults({
  data,
  examples = null
}: {
  data: SearchData
  examples?: SearchExamplesData | null
}) {
  if (data.state === 'noResults') return <NoResults />
  const { query, kanji, rows, readingRefinement } = data
  const discovered = data.sections.includes('discoveredWords')
  const listed = data.sections.includes('results') || discovered
  return (
    <>
      <p className="text-sm text-muted-foreground">
        {rows.length} {rows.length === 1 ? 'word' : 'words'} for{' '}
        <span lang="ja" className="text-foreground">
          {query}
        </span>
      </p>
      {data.examples && (data.examples.target.kind === 'word' || examples) ? (
        <Card className="py-0" data-section="examples">
          <Row
            path={
              data.examples.target.kind === 'word'
                ? data.examples.target.path
                : `#${searchExamplesAnchor}`
            }
          >
            <ItemContent>
              <p className="font-semibold">{data.examples.title}</p>
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
            {kanji ? <KanjiRow kanji={kanji} /> : null}
            {rows.map((word, position) => (
              <Fragment key={word.id}>
                {position > 0 || kanji ? <ItemSeparator className="my-0" /> : null}
                <WordRow word={word} />
              </Fragment>
            ))}
          </ItemGroup>
        </Card>
      ) : null}
      {examples ? <SearchExamplesSection data={examples} /> : null}
    </>
  )
}
