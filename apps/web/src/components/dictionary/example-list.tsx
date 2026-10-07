'use client'

import Link from 'next/link'
import { Fragment } from 'react'
import { LoadMoreFooter, useLoadMore } from '@/components/dictionary/load-more'
import { PronounceButton } from '@/components/dictionary/pronounce-button'
import { RubyText } from '@/components/dictionary/ruby-text'
import type { PageExample, PageExampleToken } from '@/lib/dictionary/page-example'

const linkClass = 'underline-offset-4 hover:text-muted-foreground'

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

export function ExampleList({
  initial,
  listed,
  path
}: {
  initial: PageExample[]
  listed: number
  path: string | null
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
          <ExampleItem key={example.position} example={example} />
        ))}
      </ul>
      <LoadMoreFooter state={list} labels={exampleLabels} />
    </div>
  )
}
