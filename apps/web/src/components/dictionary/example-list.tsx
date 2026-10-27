'use client'

import Link from 'next/link'
import { Fragment } from 'react'
import { LoadMoreFooter, useLoadMore } from '@/components/dictionary/load-more'
import { PronounceButton } from '@/components/dictionary/pronounce-button'
import { RubyText } from '@/components/dictionary/ruby-text'
import type { PageExample, PageExampleToken } from '@/lib/dictionary/page-example'
import type { ExampleListText } from '@/lib/dictionary/screen-text'
import { type Locale, sourceLang } from '@/lib/i18n/config'
import { fill, formatNumber } from '@/lib/i18n/format'
import { localizedPath } from '@/lib/i18n/paths'
import { cn } from '@/lib/utils'

const linkClass = 'underline-offset-4 hover:text-muted-foreground'

function Token({
  token,
  locale,
  text
}: {
  token: PageExampleToken
  locale: Locale
  text: ExampleListText
}) {
  const className = cn(
    'whitespace-nowrap',
    token.isPageWord
      ? 'mr-0.5 border-b-2 border-foreground font-medium'
      : token.link && 'mr-0.5 border-b border-border'
  )
  const ruby = <RubyText segments={token.ruby} className={className} pageWord={token.isPageWord} />
  const shown = token.meaning ? (
    <>
      <span>{ruby}</span>
      <span data-aid="meaning" lang={sourceLang(locale)}>
        {token.meaning}
      </span>
    </>
  ) : (
    ruby
  )
  if (!token.path || !token.link) return token.meaning ? <span>{shown}</span> : ruby
  const title =
    'entSeqs' in token.link
      ? fill(text.examples.possibleEntries, {
          count: formatNumber(token.link.entSeqs.length, locale)
        })
      : undefined
  return (
    <Link href={localizedPath(token.path, locale)} className={linkClass} title={title}>
      {shown}
    </Link>
  )
}

interface ExampleProps {
  example: PageExample
  locale: Locale
  text: ExampleListText
}

function ExampleItem({ example, locale, text }: ExampleProps) {
  return (
    <li
      className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
      data-example={example.position}
      data-example-pair={example.pairId}
    >
      <ExampleContent example={example} locale={locale} text={text} />
    </li>
  )
}

export function MeaningExample({ meaning, ...props }: ExampleProps & { meaning: number }) {
  return (
    <div
      className="flex items-start gap-3 pt-2"
      data-meaning-example={meaning}
      data-example-pair={props.example.pairId}
    >
      <ExampleContent {...props} />
    </div>
  )
}

function ExampleRomaji({
  romaji,
  unavailable
}: {
  romaji: string | null | undefined
  unavailable: string
}) {
  if (romaji === undefined) return null
  return romaji === null ? (
    <p data-aid="romaji" className="text-sm">
      {unavailable}
    </p>
  ) : (
    <p data-aid="romaji" lang="ja-Latn">
      {romaji}
    </p>
  )
}

function ExampleContent({ example, locale, text }: ExampleProps) {
  let offset = 0
  return (
    <>
      <div className="flex flex-1 flex-col gap-1">
        <p lang="ja" className="text-xl leading-[2.2]">
          {example.tokens.map(token => {
            const key = offset
            offset += token.text.length
            return (
              <Fragment key={key}>
                <Token token={token} locale={locale} text={text} />
              </Fragment>
            )
          })}
        </p>
        <ExampleRomaji romaji={example.romaji} unavailable={text.examples.romajiUnavailable} />
        <p className="text-muted-foreground" lang={sourceLang(locale)} data-aid="translation">
          {example.translation}
        </p>
      </div>
      <PronounceButton
        text={example.text}
        label={text.examples.pronounce}
        unsupported={text.pronounce.unsupported}
      />
    </>
  )
}

const readExamples = (response: unknown) => (response as { examples: PageExample[] }).examples

export function ExampleList({
  initial,
  listed,
  path,
  locale,
  text
}: {
  initial: PageExample[]
  listed: number
  path: string | null
  locale: Locale
  text: ExampleListText
}) {
  const list = useLoadMore({
    initial,
    total: path === null ? initial.length : listed,
    path: path ?? '',
    read: readExamples
  })
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y">
        {list.items.map(example => (
          <ExampleItem key={example.position} example={example} locale={locale} text={text} />
        ))}
      </ul>
      <LoadMoreFooter state={list} labels={text.examples} />
    </div>
  )
}
