'use client'

import { newestChangedFirst } from '@zenbu/account-rules/account-views'
import { useState } from 'react'
import { matchesTyped } from '@/lib/account/synced-views'
import { countOf } from '@/lib/i18n/format'
import { type AreaProps, useChanging, WordRows } from './parts'

export function KnownWords({ copy, locale, text, change }: AreaProps) {
  const words = text.synced.knownWords
  const [typed, setTyped] = useState('')
  const { busy, problem, run } = useChanging()
  const known = newestChangedFirst(copy.held('knownWord')).filter(word => word.data.known === true)
  const shown = known.filter(word => matchesTyped(word.data, typed))
  const empty = known.length === 0 ? words.none : shown.length === 0 ? words.noMatch : null
  return (
    <section className="flex flex-col gap-4" aria-label={text.pages.knownWords.title}>
      <p className="text-sm text-muted-foreground">{countOf(words.count, known.length, locale)}</p>
      <WordRows
        filter={
          known.length > 0
            ? { id: 'known-words-filter', label: words.search, typed, onTyped: setTyped }
            : null
        }
        shown={shown}
        empty={empty}
        problem={problem}
        locale={locale}
        busy={busy}
        action={{
          label: words.markUnknown,
          named: words.markUnknownNamed,
          on: word => void run(() => change('knownWord', 'clear', word.entityId))
        }}
      />
    </section>
  )
}
