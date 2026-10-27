import type { FrequencyResult } from '@zenbu/dictionary-core/detail/frequency'
import { romaji } from '@zenbu/dictionary-core/detail/romaji'
import type { RubySegment } from '@zenbu/dictionary-core/detail/ruby'
import { Card } from '@zenbu/ui/components/card'
import { Item, ItemActions, ItemContent, ItemGroup, ItemSeparator } from '@zenbu/ui/components/item'
import { ChevronRightIcon } from 'lucide-react'
import Link from 'next/link'
import { Fragment, type ReactNode } from 'react'
import { FrequencyBadges } from '@/components/dictionary/frequency'
import { RomajiLine } from '@/components/dictionary/reading-aid-lines'
import { RubyText } from '@/components/dictionary/ruby-text'
import { type Locale, sourceLang } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { fill, formatNumber } from '@/lib/i18n/format'
import { localizedPath } from '@/lib/i18n/paths'

export function Row({
  path,
  label,
  locale,
  children
}: {
  path: string | null
  label?: string
  locale: Locale
  children: ReactNode
}) {
  return (
    <Item
      render={path ? <Link href={localizedPath(path, locale)} aria-label={label} /> : undefined}
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
  reading: string
  summary: string
  chips: FrequencyResult[]
  rank?: number | null
}

export function WordRow({ word, locale }: { word: RowWord; locale: Locale }) {
  return (
    <Row path={word.path} locale={locale}>
      {word.rank ? (
        <span className="w-12 shrink-0 text-sm text-muted-foreground tabular-nums">
          {fill(getDictionary(locale).frequency.rank, { rank: formatNumber(word.rank, locale) })}
        </span>
      ) : null}
      <ItemContent className="gap-1.5" data-result-row={word.entSeq}>
        <RubyText segments={word.ruby} className="text-2xl font-medium leading-tight" />
        <RomajiLine romaji={romaji(word.reading)} className="text-sm" />
        <p className="meaning-clamp text-sm" lang={sourceLang(locale)}>
          {word.summary}
        </p>
        <FrequencyBadges frequency={word.chips} locale={locale} />
      </ItemContent>
    </Row>
  )
}

export function WordList({
  words,
  section,
  locale
}: {
  words: readonly RowWord[]
  section?: string
  locale: Locale
}) {
  return (
    <Card className="py-2" data-section={section}>
      <ItemGroup className="gap-0">
        {words.map((word, position) => (
          <Fragment key={word.entSeq}>
            {position > 0 ? <ItemSeparator className="my-0" /> : null}
            <WordRow word={word} locale={locale} />
          </Fragment>
        ))}
      </ItemGroup>
    </Card>
  )
}
