import { Fragment } from 'react'
import { Japanese, Latin, Typed } from '@/components/tools/rich-text'
import { ToolSection } from '@/components/tools/tool-section'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { type SpellingRule, spellingRules, typingTips, widthRows } from '@/lib/tools/content'
import type { Converter } from '@/lib/tools/converters'

function Example({ from, to, typed }: { from: string; to: string; typed: boolean }) {
  return typed ? (
    <>
      <Typed>{from}</Typed> → <Japanese>{to}</Japanese>
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
    <ToolSection title={title}>
      <div className="w-fit max-w-full">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>For</TableHead>
              <TableHead>{typed ? 'How to type it' : 'How it’s spelled'}</TableHead>
              <TableHead>Examples</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map(rule => (
              <TableRow key={rule.label}>
                <TableCell className="whitespace-normal">{rule.label}</TableCell>
                <TableCell className="whitespace-normal">{rule.rule}</TableCell>
                <TableCell className="whitespace-normal">
                  {rule.examples.map(([from, to], index) => (
                    <Fragment key={from}>
                      {index ? ', ' : ''}
                      <Example from={from} to={to} typed={typed} />
                    </Fragment>
                  ))}
                  {rule.note ? `${rule.examples.length ? ', ' : ''}${rule.note}` : ''}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </ToolSection>
  )
}

function WidthReference() {
  return (
    <ToolSection title="What changes" line="Each kind of character, in both widths.">
      <div className="w-fit max-w-full">
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
                  {row.kind}
                  {row.note ? (
                    <span className="block text-muted-foreground">{row.note}</span>
                  ) : null}
                </TableCell>
                <TableCell lang="ja">{row.half}</TableCell>
                <TableCell lang="ja">{row.full}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </ToolSection>
  )
}

export function ToolReference({ converter }: { converter: Converter }) {
  if (converter.pair === 'width') return <WidthReference />
  if (converter.slug === 'romaji-to-kana') {
    return <SpellingRules title="Typing tips" rules={typingTips} typed />
  }
  if (converter.slug === 'kana-to-romaji') {
    return <SpellingRules title="Spelling rules" rules={spellingRules} typed={false} />
  }
  return null
}
