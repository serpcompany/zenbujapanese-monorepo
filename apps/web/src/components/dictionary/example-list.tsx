'use client'

import Link from 'next/link'
import { Fragment } from 'react'
import { LoadMoreFooter, useLoadMore } from '@/components/dictionary/load-more'
import { PronounceButton } from '@/components/dictionary/pronounce-button'
import { RubyText } from '@/components/dictionary/ruby-text'
import {
  licenseUrl,
  type TatoebaSentence,
  tatoebaSentenceUrl
} from '@/lib/dictionary/detail/examples'
import type { PageExample, PageExampleToken } from '@/lib/dictionary/page-example'

const linkClass = 'underline-offset-4 hover:text-muted-foreground'

/**
 * One word of a sentence, as the app's LinkedTokenView draws it: a word with an entry is
 * underlined and links to it (the page's own word stands out), a word with several possible
 * entries links to a search for it, and anything else is plain text.
 */
function Token({ token }: { token: PageExampleToken }) {
  const className = token.isPageWord
    ? 'mr-0.5 border-b-2 border-foreground font-medium'
    : token.link
      ? 'mr-0.5 border-b border-border'
      : undefined
  const text = <RubyText segments={token.ruby} className={className} pageWord={token.isPageWord} />
  if (!token.path || !token.link) return text
  const title =
    'entSeqs' in token.link ? `${token.link.entSeqs.length} possible entries` : undefined
  return (
    <Link href={token.path} className={linkClass} title={title}>
      {text}
    </Link>
  )
}

function Source({ sentence, label }: { sentence: TatoebaSentence; label: string }) {
  return (
    <>
      <a href={tatoebaSentenceUrl(sentence.id)} className="underline underline-offset-2">
        {label} #{sentence.id}
      </a>
      {sentence.contributor ? ` by ${sentence.contributor}` : null}
    </>
  )
}

function License({ name }: { name: string }) {
  const url = licenseUrl(name)
  return url ? (
    <a href={url} className="underline underline-offset-2">
      {name}
    </a>
  ) : (
    name
  )
}

/** Each side of the Tatoeba pair, with its contributor and license. */
function Attribution({ example }: { example: PageExample }) {
  const { japanese, english } = example
  const sameLicense = japanese.license === english.license
  return (
    <p className="text-xs text-muted-foreground">
      Tatoeba: <Source sentence={japanese} label="Japanese" />
      {sameLicense ? null : (
        <>
          , <License name={japanese.license} />
        </>
      )}
      ; <Source sentence={english} label="English" />, <License name={english.license} />
    </p>
  )
}

function ExampleItem({ example }: { example: PageExample }) {
  let offset = 0
  return (
    <li
      className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
      data-example={example.position}
      data-example-pair={example.pairId}
    >
      <div className="flex flex-1 flex-col gap-1">
        <p lang="ja" className="text-xl leading-[2.2]">
          {example.tokens.map(token => {
            const key = offset
            offset += token.text.length
            return (
              <Fragment key={key}>
                <Token token={token} />
              </Fragment>
            )
          })}
        </p>
        <p className="text-muted-foreground">{example.translation}</p>
        <Attribution example={example} />
      </div>
      <PronounceButton text={example.text} label="Pronounce sentence" />
    </li>
  )
}

const readExamples = (response: unknown) => (response as { examples: PageExample[] }).examples

const exampleLabels = {
  more: 'Load more examples',
  loading: 'Loading examples…',
  stale: 'These examples have been updated since the page loaded.',
  reload: 'Reload for more examples'
}

/**
 * A word's, a search's, or a conjugated form's examples: the first ones rendered with the page,
 * then more loaded from `path` as the list scrolls into view (or with the button), up to the
 * `listed` the app shows.
 */
export function ExampleList({
  initial,
  listed,
  path
}: {
  initial: PageExample[]
  listed: number
  path: string
}) {
  const list = useLoadMore({ initial, total: listed, path, read: readExamples })
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y">
        {list.items.map(example => (
          <ExampleItem key={example.position} example={example} />
        ))}
      </ul>
      <LoadMoreFooter state={list} labels={exampleLabels} />
    </div>
  )
}
