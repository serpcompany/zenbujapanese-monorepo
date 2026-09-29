'use client'

import Link from 'next/link'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { PronounceButton } from '@/components/dictionary/pronounce-button'
import { RubyText } from '@/components/dictionary/ruby-text'
import { Button } from '@/components/ui/button'
import type { PageExample, PageExampleToken } from '@/lib/dictionary/data'
import {
  licenseUrl,
  type TatoebaSentence,
  tatoebaSentenceUrl
} from '@/lib/dictionary/detail/examples'

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
  const text = <RubyText segments={token.ruby} className={className} />
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
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
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

/**
 * A word's examples: the first ones rendered with the page, then more loaded from `path` as the
 * list scrolls into view (or with the button), up to the `listed` the app shows.
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
  const [examples, setExamples] = useState(initial)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const hasMore = examples.length < listed

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return
    setLoading(true)
    setFailed(false)
    try {
      const response = await fetch(`${path}?from=${examples.length}`)
      if (!response.ok) throw new Error(`${response.status}`)
      const { examples: more } = (await response.json()) as { examples: PageExample[] }
      // A deploy can change the list under an open page; stop rather than repeat.
      if (more.length === 0) setFailed(true)
      else setExamples(current => [...current, ...more])
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [examples.length, hasMore, loading, path])

  useEffect(() => {
    const target = end.current
    if (!target || !hasMore || failed) return
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) void loadMore()
      },
      { rootMargin: '400px' }
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [failed, hasMore, loadMore])

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y">
        {examples.map(example => (
          <ExampleItem key={example.position} example={example} />
        ))}
      </ul>
      {hasMore ? (
        <div ref={end} className="flex justify-center">
          <Button variant="outline" onClick={() => void loadMore()} disabled={loading}>
            {loading ? 'Loading examples…' : failed ? 'Try again' : 'Load more examples'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
