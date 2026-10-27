'use client'

import { newestChangedFirst } from '@zenbu/account-rules/account-views'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Item, ItemActions, ItemContent, ItemTitle } from '@/components/ui/item'
import { itemName, matchesTyped } from '@/lib/account/synced-views'
import { countOf, fill } from '@/lib/i18n/format'
import { type AreaProps, Filter, ItemLink, Rows, useChanging } from './parts'

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
      {known.length > 0 ? (
        <Filter id="known-words-filter" label={words.search} value={typed} onChange={setTyped} />
      ) : null}
      <Rows empty={empty} problem={problem}>
        {shown.map(word => (
          <Item key={word.entityId} variant="outline">
            <ItemContent>
              <ItemTitle>
                <ItemLink data={word.data} locale={locale} />
              </ItemTitle>
            </ItemContent>
            <ItemActions>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                aria-label={fill(words.markUnknownNamed, { name: itemName(word.data) })}
                onClick={() => void run(() => change('knownWord', 'clear', word.entityId))}
              >
                {words.markUnknown}
              </Button>
            </ItemActions>
          </Item>
        ))}
      </Rows>
    </section>
  )
}
