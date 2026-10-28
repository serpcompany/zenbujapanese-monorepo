import { romaji } from '@zenbu/dictionary-core/detail/romaji'
import type {
  KanjiRow,
  ResultRow,
  SearchResultsScreen
} from '@zenbu/dictionary-core/results/results'
import { Card } from '@zenbu/ui/components/card'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@zenbu/ui/components/empty'
import { Item, ItemActions, ItemContent, ItemGroup, ItemSeparator } from '@zenbu/ui/components/item'
import { RomajiLine } from '@zenbu/ui/dictionary/reading-aid-lines'
import { RubyText } from '@zenbu/ui/dictionary/ruby-text'
import { ChevronRight, Search } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import type { PanelTabProps } from '../side-panel/route'
import { lookUpLabels } from './labels'

type Found = Extract<SearchResultsScreen, { state: 'results' }>

type Open = PanelTabProps['open']

function Row({ choose, children }: { choose(): void; children: ReactNode }) {
  return (
    <Item
      render={<button type="button" onClick={choose} />}
      className="w-full cursor-pointer rounded-none px-4 text-left"
    >
      {children}
      <ItemActions>
        <ChevronRight className="size-4 text-muted-foreground" />
      </ItemActions>
    </Item>
  )
}

function NoMatches() {
  return (
    <Empty data-search="no-results">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Search />
        </EmptyMedia>
        <EmptyTitle>{lookUpLabels.noMatches}</EmptyTitle>
      </EmptyHeader>
    </Empty>
  )
}

function KanjiResult({ kanji, open }: { kanji: KanjiRow; open: Open }) {
  return (
    <Row choose={() => open({ page: 'kanji', character: kanji.character })}>
      <span lang="ja" className="text-4xl font-light">
        {kanji.character}
      </span>
      <ItemContent className="gap-0.5" data-kanji-row={kanji.character}>
        <span className="text-xs font-bold">{kanji.label}</span>
        <span className="text-sm">{kanji.summary}</span>
      </ItemContent>
    </Row>
  )
}

function WordResult({ word, open }: { word: ResultRow; open: Open }) {
  return (
    <Row choose={() => open({ page: 'word', entSeq: word.entSeq })}>
      <ItemContent className="gap-1.5" data-result-row={word.entSeq}>
        <RubyText segments={word.ruby} className="text-2xl font-medium leading-tight" />
        <RomajiLine romaji={romaji(word.reading)} className="text-sm" />
        <p className="text-sm">{word.summary}</p>
      </ItemContent>
    </Row>
  )
}

function Listed({ found, open }: { found: Found; open: Open }) {
  const discovered = found.sections.includes('discoveredWords')
  if (!discovered && !found.sections.includes('results')) return null
  return (
    <Card className="py-2" data-section={discovered ? 'discoveredWords' : 'results'}>
      <ItemGroup className="gap-0">
        {discovered && <h2 className="px-4 py-2 font-semibold">{lookUpLabels.discovered}</h2>}
        {found.kanji && <KanjiResult kanji={found.kanji} open={open} />}
        {found.rows.map((word, position) => (
          <Fragment key={word.id}>
            {(position > 0 || found.kanji) && <ItemSeparator className="my-0" />}
            <WordResult word={word} open={open} />
          </Fragment>
        ))}
      </ItemGroup>
    </Card>
  )
}

export function SearchResults({
  screen,
  open,
  refine
}: {
  screen: SearchResultsScreen
  open: Open
  refine(query: string): void
}) {
  if (screen.state === 'noResults') return <NoMatches />
  const { readingRefinement } = screen
  return (
    <>
      {readingRefinement && (
        <Card className="py-0" data-section="readingRefinement">
          <Row choose={() => refine(readingRefinement.query)}>
            <ItemContent>
              <p className="font-semibold">{readingRefinement.title}</p>
            </ItemContent>
          </Row>
        </Card>
      )}
      <Listed found={screen} open={open} />
    </>
  )
}
