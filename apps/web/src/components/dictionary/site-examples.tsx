'use client'

import {
  ConjugationsSection,
  type ConjugationsText,
  type ShownConjugations
} from '@zenbu/ui/dictionary/conjugations'
import {
  ExampleList,
  type ExampleListText,
  MeaningExample
} from '@zenbu/ui/dictionary/example-list'
import { useCallback, useMemo, useRef } from 'react'
import type { PageExample } from '@/lib/dictionary/page-example'
import { fetchExamplePage, fetchFormExamples } from '@/lib/dictionary/page-fetch'
import { type Locale, sourceLang } from '@/lib/i18n/config'
import { reloadPage, showUnsupported } from './site-actions'
import { addWordPaths, exampleTargets, wordLinks } from './word-links'

function useExampleLinks(initial: readonly PageExample[], locale: Locale) {
  const paths = useRef<Map<string, string>>(null)
  paths.current ??= addWordPaths(new Map(), exampleTargets(initial))
  const known = paths.current
  const renderWordLink = useMemo(() => wordLinks(known, locale), [known, locale])
  const learn = useCallback(
    (examples: readonly PageExample[]) => addWordPaths(known, exampleTargets(examples)),
    [known]
  )
  const actions = { lang: sourceLang(locale), renderWordLink, onUnsupported: showUnsupported }
  return [actions, learn] as const
}

export function SiteExampleList({
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
  const [actions, learn] = useExampleLinks(initial, locale)
  const loadMore = useCallback(
    async (from: number) => {
      const page = await fetchExamplePage(`${path}&from=${from}`)
      if (page.kind === 'items') learn(page.items)
      return page
    },
    [path, learn]
  )
  return (
    <ExampleList
      initial={initial}
      paging={path === null ? null : { listed, loadMore, onReload: reloadPage }}
      text={text}
      {...actions}
    />
  )
}

export function SiteMeaningExample({
  example,
  meaning,
  locale,
  text
}: {
  example: PageExample
  meaning: number
  locale: Locale
  text: ExampleListText
}) {
  const [actions] = useExampleLinks([example], locale)
  return <MeaningExample example={example} meaning={meaning} text={text} {...actions} />
}

export function SiteConjugationsSection({
  conjugations,
  locale,
  text
}: {
  conjugations: ShownConjugations
  locale: Locale
  text: ConjugationsText
}) {
  const [actions, learn] = useExampleLinks([], locale)
  const loadFormExamples = useCallback(
    async (surface: string) => {
      const examples = await fetchFormExamples(surface)
      learn(examples)
      return examples
    },
    [learn]
  )
  return (
    <ConjugationsSection
      conjugations={conjugations}
      text={text}
      loadFormExamples={loadFormExamples}
      {...actions}
    />
  )
}
