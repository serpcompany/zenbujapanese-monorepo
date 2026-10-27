'use client'

import type { Example, ExampleToken } from '@zenbu/dictionary-core/detail/examples'
import { fill } from '@zenbu/dictionary-core/detail/template'
import { cn } from 'cn'
import { Fragment } from 'react'
import { type LoadMore, LoadMoreFooter, type LoadMoreLabels, useLoadMore } from './load-more'
import { type OnUnsupported, PronounceButton } from './pronounce-button'
import { RubyText } from './ruby-text'
import type { RenderWordLink } from './word-link'

export type ShownExample = Omit<Example, 'tokens' | 'japanese' | 'english'> & {
  tokens: ExampleToken[]
}

export interface ExampleListText {
  lang: string
  examples: LoadMoreLabels & {
    pronounce: string
    possibleEntries: string
    romajiUnavailable: string
  }
  pronounce: { unsupported: string }
}

export interface ExampleActions {
  renderWordLink: RenderWordLink
  onUnsupported: OnUnsupported
}

interface ExampleProps extends ExampleActions {
  example: ShownExample
  lang?: string
  text: ExampleListText
}

const linkClass = 'underline-offset-4 hover:text-muted-foreground'

function Token({
  token,
  lang,
  text,
  renderWordLink
}: Omit<ExampleProps, 'example' | 'onUnsupported'> & { token: ExampleToken }) {
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
      <span data-aid="meaning" lang={lang}>
        {token.meaning}
      </span>
    </>
  ) : (
    ruby
  )
  const unlinked = token.meaning ? <span>{shown}</span> : ruby
  if (!token.link) return unlinked
  const title =
    'entSeqs' in token.link
      ? fill(text.examples.possibleEntries, {
          count: new Intl.NumberFormat(text.lang).format(token.link.entSeqs.length)
        })
      : undefined
  return (
    renderWordLink({ target: token.link, className: linkClass, title, children: shown }) ?? unlinked
  )
}

function ExampleItem(props: ExampleProps) {
  return (
    <li
      className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
      data-example={props.example.position}
      data-example-pair={props.example.pairId}
    >
      <ExampleContent {...props} />
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

function ExampleContent({ example, lang, text, renderWordLink, onUnsupported }: ExampleProps) {
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
                <Token token={token} lang={lang} text={text} renderWordLink={renderWordLink} />
              </Fragment>
            )
          })}
        </p>
        <ExampleRomaji romaji={example.romaji} unavailable={text.examples.romajiUnavailable} />
        <p className="text-muted-foreground" lang={lang} data-aid="translation">
          {example.translation}
        </p>
      </div>
      <PronounceButton
        text={example.text}
        label={text.examples.pronounce}
        unsupported={text.pronounce.unsupported}
        onUnsupported={onUnsupported}
      />
    </>
  )
}

export interface ExamplePaging<T> {
  listed: number
  loadMore: LoadMore<T>
  onReload: () => void
}

export function ExampleList<T extends ShownExample>({
  initial,
  paging,
  ...props
}: ExampleActions & {
  initial: T[]
  paging: ExamplePaging<T> | null
  lang?: string
  text: ExampleListText
}) {
  const list = useLoadMore({
    initial,
    total: paging === null ? initial.length : paging.listed,
    loadMore: paging?.loadMore ?? noMore
  })
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y">
        {list.items.map(example => (
          <ExampleItem key={example.position} example={example} {...props} />
        ))}
      </ul>
      <LoadMoreFooter
        state={list}
        labels={props.text.examples}
        onReload={paging?.onReload ?? noReload}
      />
    </div>
  )
}

async function noMore() {
  return { kind: 'stale' } as const
}

function noReload() {}
