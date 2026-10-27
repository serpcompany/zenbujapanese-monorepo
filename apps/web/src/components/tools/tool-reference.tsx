import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@zenbu/ui/components/table'
import { Fragment } from 'react'
import { Japanese, Latin, Typed } from '@/components/tools/rich-text'
import { ToolSection } from '@/components/tools/tool-section'
import type { Locale } from '@/lib/i18n/config'
import { type Dictionary, getDictionary } from '@/lib/i18n/dictionary'
import type { Converter } from '@/lib/tools/converters'
import {
  type SpellingRule,
  spellingRulesIn,
  typingTipsIn,
  widthRowsIn
} from '@/lib/tools/tool-pages'

type ReferenceText = Dictionary['tools']['reference']

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
  typed,
  text
}: {
  title: string
  rules: readonly SpellingRule[]
  typed: boolean
  text: ReferenceText
}) {
  return (
    <ToolSection title={title}>
      <div className="w-fit max-w-full">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{text.for}</TableHead>
              <TableHead>{typed ? text.howToType : text.howSpelled}</TableHead>
              <TableHead>{text.examples}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map(rule => (
              <TableRow key={rule.id}>
                <TableCell className="whitespace-normal">{rule.label}</TableCell>
                <TableCell className="whitespace-normal">{rule.rule}</TableCell>
                <TableCell className="whitespace-normal">
                  {rule.examples.map(([from, to], index) => (
                    <Fragment key={from}>
                      {index ? text.separator : ''}
                      <Example from={from} to={to} typed={typed} />
                    </Fragment>
                  ))}
                  {rule.note ? `${rule.examples.length ? text.separator : ''}${rule.note}` : ''}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </ToolSection>
  )
}

function WidthReference({ locale, text }: { locale: Locale; text: ReferenceText }) {
  return (
    <ToolSection title={text.widthsTitle} line={text.widthsLine}>
      <div className="w-fit max-w-full">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{text.character}</TableHead>
              <TableHead>{text.halfWidth}</TableHead>
              <TableHead>{text.fullWidth}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {widthRowsIn(locale).map(row => (
              <TableRow key={row.id}>
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

export function ToolReference({ converter, locale }: { converter: Converter; locale: Locale }) {
  const text = getDictionary(locale).tools.reference
  if (converter.pair === 'width') return <WidthReference locale={locale} text={text} />
  if (converter.slug === 'romaji-to-kana') {
    return (
      <SpellingRules title={text.typingTipsTitle} rules={typingTipsIn(locale)} typed text={text} />
    )
  }
  if (converter.slug === 'kana-to-romaji') {
    return (
      <SpellingRules
        title={text.spellingRulesTitle}
        rules={spellingRulesIn(locale)}
        typed={false}
        text={text}
      />
    )
  }
  return null
}
