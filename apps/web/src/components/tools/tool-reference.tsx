import { ArrowRightIcon } from 'lucide-react'
import Link from 'next/link'
import { Fragment } from 'react'
import { KanaChartTabs } from '@/components/tools/kana-chart-tabs'
import { Japanese, Latin } from '@/components/tools/rich-text'
import { ToolSection } from '@/components/tools/tool-section'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { kanaChartsPath } from '@/lib/dictionary/browse/paths'
import { type SpellingRule, spellingRules, typingTips, widthRows } from '@/lib/tools/content'
import type { Converter } from '@/lib/tools/converters'

function Example({ from, to, typed }: { from: string; to: string; typed: boolean }) {
  return typed ? (
    <>
      <Latin>{from}</Latin> → <Japanese>{to}</Japanese>
    </>
  ) : (
    <>
      <Japanese>{from}</Japanese> → <Latin>{to}</Latin>
    </>
  )
}

function SpellingRules({
  title,
  rules,
  typed
}: {
  title: string
  rules: readonly SpellingRule[]
  typed: boolean
}) {
  return (
    <div className="flex max-w-3xl flex-col gap-3">
      <h3 className="text-base font-semibold">{title}</h3>
      <dl className="divide-y border-y text-[15px]">
        {rules.map(rule => (
          <div key={rule.label} className="grid gap-1 py-2.5 sm:grid-cols-[11rem_minmax(0,1fr)]">
            <dt className="font-medium">{rule.label}</dt>
            <dd className="text-muted-foreground">
              {rule.rule}
              {rule.examples.length || rule.note ? ': ' : ''}
              {rule.examples.map(([from, to], index) => (
                <Fragment key={from}>
                  {index ? ', ' : ''}
                  <Example from={from} to={to} typed={typed} />
                </Fragment>
              ))}
              {rule.note ? `${rule.examples.length ? ', ' : ''}${rule.note}` : ''}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function KanaReference({ converter }: { converter: Converter }) {
  const kana = converter.pair === 'kana'
  return (
    <ToolSection
      title={kana ? 'Hiragana and katakana' : 'Kana and romaji'}
      aside={
        <Link
          href={kanaChartsPath}
          className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
        >
          Full kana charts, with common words
          <ArrowRightIcon aria-hidden="true" className="size-4" />
        </Link>
      }
    >
      <KanaChartTabs shows={kana ? 'both scripts' : 'other spellings'} />
      {converter.slug === 'romaji-to-kana' ? (
        <SpellingRules title="Typing tips" rules={typingTips} typed />
      ) : null}
      {converter.slug === 'kana-to-romaji' ? (
        <SpellingRules title="Spelling rules" rules={spellingRules} typed={false} />
      ) : null}
    </ToolSection>
  )
}

function Sample({ children }: { children: string }) {
  return (
    <span lang="ja" className="rounded-sm bg-muted px-0.5 whitespace-pre text-foreground">
      {children}
    </span>
  )
}

function WidthReference() {
  return (
    <ToolSection title="What changes" line="Each kind of character, in both widths.">
      <div className="max-w-2xl">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Character</TableHead>
              <TableHead>Half-width</TableHead>
              <TableHead>Full-width</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {widthRows.map(row => (
              <TableRow key={row.kind}>
                <TableCell className="whitespace-normal">
                  <span className="font-medium">{row.kind}</span>
                  {row.note ? (
                    <span className="block text-muted-foreground">{row.note}</span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Sample>{row.half}</Sample>
                </TableCell>
                <TableCell>
                  <Sample>{row.full}</Sample>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </ToolSection>
  )
}

export function ToolReference({ converter }: { converter: Converter }) {
  return converter.pair === 'width' ? <WidthReference /> : <KanaReference converter={converter} />
}
