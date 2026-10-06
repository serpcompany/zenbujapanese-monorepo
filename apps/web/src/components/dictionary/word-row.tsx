import type { FrequencyResult } from '@zenbu/dictionary-core/detail/frequency'
import type { RubySegment } from '@zenbu/dictionary-core/detail/ruby'
import { ChevronRightIcon } from 'lucide-react'
import Link from 'next/link'
import { Fragment, type ReactNode } from 'react'
import { FrequencyBadges } from '@/components/dictionary/frequency'
import { RubyText } from '@/components/dictionary/ruby-text'
import { Card } from '@/components/ui/card'
import { Item, ItemActions, ItemContent, ItemGroup, ItemSeparator } from '@/components/ui/item'
import { formatCount } from '@/lib/dictionary/browse/copy'

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

export interface RowWord {
  entSeq: number
  path: string | null
  ruby: RubySegment[]
  summary: string
  chips: FrequencyResult[]
  rank?: number | null
}

export function WordRow({ word }: { word: RowWord }) {
  return (
    <Row path={word.path}>
      {word.rank ? (
        <span className="w-12 shrink-0 text-sm text-muted-foreground tabular-nums">
          #{formatCount(word.rank)}
        </span>
      ) : null}
      <ItemContent className="gap-1.5" data-result-row={word.entSeq}>
        <RubyText segments={word.ruby} className="text-2xl font-medium leading-tight" />
        <p className="meaning-clamp text-sm">{word.summary}</p>
        <FrequencyBadges frequency={word.chips} />
      </ItemContent>
    </Row>
  )
}

export function WordList({ words, section }: { words: readonly RowWord[]; section?: string }) {
  return (
    <Card className="py-2" data-section={section}>
      <ItemGroup className="gap-0">
        {words.map((word, position) => (
          <Fragment key={word.entSeq}>
            {position > 0 ? <ItemSeparator className="my-0" /> : null}
            <WordRow word={word} />
          </Fragment>
        ))}
      </ItemGroup>
    </Card>
  )
}
