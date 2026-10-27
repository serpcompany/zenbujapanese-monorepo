'use client'

import { isMarkedKnown, wordsOfList } from '@zenbu/account-rules/account-views'
import Link from 'next/link'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { accountPages } from '@/lib/account/pages'
import { matchesTyped, textIn } from '@/lib/account/synced-views'
import { countOf } from '@/lib/i18n/format'
import { localizedPath } from '@/lib/i18n/paths'
import { ListActions } from './lists'
import { type AreaProps, useChanging, WordRows } from './parts'

export function ListWords(props: AreaProps & { listId: string }) {
  const { copy, locale, text, pages, change, listId } = props
  const words = text.synced.lists
  const [typed, setTyped] = useState('')
  const { busy, problem, run } = useChanging()
  const list = copy.heldOne('list', listId)
  const allLists = (
    <Link href={localizedPath(accountPages.lists.path, locale)} className="self-start text-sm">
      {words.allLists}
    </Link>
  )
  if (!list?.data) {
    return (
      <section className="flex flex-col gap-4" aria-label={text.pages.lists.title}>
        {allLists}
        <p>{words.gone}</p>
      </section>
    )
  }
  const name = textIn(list.data, 'name')
  const inList = wordsOfList(copy.held('listWord'), listId)
  const shown = inList.filter(word => matchesTyped(word.data, typed))
  const isKnown = (itemId: string) => isMarkedKnown(copy.heldOne('knownWord', itemId)?.data)
  const empty = inList.length === 0 ? words.empty : shown.length === 0 ? words.noMatch : null
  return (
    <section className="flex flex-col gap-4" aria-labelledby="list-name">
      {allLists}
      <div className="flex flex-col gap-2">
        <h2 id="list-name" className="text-lg font-medium">
          {name}
        </h2>
        <p className="text-sm text-muted-foreground">
          {countOf(words.count, inList.length, locale)}
        </p>
        <ListActions list={{ ...list, data: list.data }} wordCount={inList.length} props={props} />
      </div>
      <WordRows
        filter={
          inList.length > 0
            ? { id: 'list-filter', label: words.search, typed, onTyped: setTyped }
            : null
        }
        shown={shown}
        empty={empty}
        problem={problem}
        locale={locale}
        pages={pages}
        busy={busy}
        badge={word =>
          isKnown(textIn(word.data, 'itemId')) ? (
            <Badge variant="secondary">{words.known}</Badge>
          ) : null
        }
        action={{
          label: words.remove,
          named: words.removeNamed,
          on: word => void run(() => change('listWord', 'remove', word.entityId))
        }}
      />
    </section>
  )
}
