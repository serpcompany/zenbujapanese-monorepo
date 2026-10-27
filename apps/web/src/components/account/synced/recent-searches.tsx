'use client'

import { recentFirst } from '@zenbu/account-rules/account-views'
import { hasSearchPath, searchPath } from '@zenbu/dictionary-core/detail/links'
import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import { shownMoment, textIn } from '@/lib/account/synced-views'
import { countOf, fill } from '@/lib/i18n/format'
import { localizedPath } from '@/lib/i18n/paths'
import { type AreaProps, AskFirst, Rows, useChanging } from './parts'

export function RecentSearches({ copy, locale, text, change, changeAll }: AreaProps) {
  const words = text.synced.recentSearches
  const [asking, setAsking] = useState(false)
  const { busy, problem, run } = useChanging()
  const searches = recentFirst(copy.held('recentSearch'), 'searchedAt')
  const clearAll = async () => {
    await run(() =>
      changeAll(
        searches.map(search => ({
          entity: 'recentSearch',
          operation: 'remove',
          entityId: search.entityId
        }))
      )
    )
    setAsking(false)
  }
  return (
    <section className="flex flex-col gap-4" aria-label={text.pages.recentSearches.title}>
      {searches.length > 0 ? (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={busy}
          onClick={() => setAsking(true)}
        >
          {words.clearAll}
        </Button>
      ) : null}
      {asking ? (
        <AskFirst
          question={countOf(words.confirmClear, searches.length, locale)}
          confirm={words.clear}
          keep={words.keep}
          busy={busy}
          onConfirm={() => void clearAll()}
          onKeep={() => setAsking(false)}
        />
      ) : null}
      <Rows empty={searches.length === 0 ? words.none : null} problem={problem}>
        {searches.map(({ entityId, data }) => {
          const query = textIn(data, 'query')
          return (
            <Item key={entityId} variant="outline">
              <ItemContent>
                <ItemTitle>
                  {hasSearchPath(query) ? (
                    <Link href={localizedPath(searchPath(query), locale)}>{query}</Link>
                  ) : (
                    query
                  )}
                </ItemTitle>
                <ItemDescription>
                  {fill(words.searched, { date: shownMoment(data, 'searchedAt', locale) })}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  aria-label={fill(words.removeNamed, { query })}
                  onClick={() => void run(() => change('recentSearch', 'remove', entityId))}
                >
                  {words.remove}
                </Button>
              </ItemActions>
            </Item>
          )
        })}
      </Rows>
    </section>
  )
}
