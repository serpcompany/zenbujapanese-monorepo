'use client'

import { ChevronRightIcon } from 'lucide-react'
import Link from 'next/link'
import { Fragment, type ReactNode } from 'react'
import { FrequencyBadges } from '@/components/dictionary/frequency'
import { LoadMoreFooter, useLoadMore } from '@/components/dictionary/load-more'
import { RubyText } from '@/components/dictionary/ruby-text'
import { Item, ItemActions, ItemContent, ItemSeparator } from '@/components/ui/item'
import type { SearchWord } from '@/lib/dictionary/data'

/** A row that opens `path`, or plain text when there is no page yet (#465). */
export function Row({
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

const readRows = (response: unknown) => (response as { rows: SearchWord[] }).rows

const rowLabels = {
  more: 'Load more words',
  loading: 'Loading words…',
  stale: 'These results have been updated since the page loaded.',
  reload: 'Reload for more words'
}

/**
 * A search's words in the app's order: the first ones rendered with the page, then the rest
 * loaded from `path` as the list scrolls into view (or with the button), up to `total`.
 */
export function ResultRows({
  initial,
  total,
  path,
  afterKanji
}: {
  initial: SearchWord[]
  total: number
  /** Null when the page shows every word. */
  path: string | null
  /** Whether the kanji row comes first, so the first word needs a separator. */
  afterKanji: boolean
}) {
  const list = useLoadMore({
    initial,
    total: path ? total : initial.length,
    path: path ?? '',
    read: readRows
  })
  return (
    <>
      {list.items.map((word, position) => (
        <Fragment key={word.id}>
          {position > 0 || afterKanji ? <ItemSeparator className="my-0" /> : null}
          <WordRow word={word} />
        </Fragment>
      ))}
      {list.hasMore ? (
        <div className="px-4 py-2">
          <LoadMoreFooter state={list} labels={rowLabels} />
        </div>
      ) : null}
    </>
  )
}
