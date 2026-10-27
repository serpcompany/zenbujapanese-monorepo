'use client'

import { wordsOfList } from '@zenbu/account-rules/account-views'
import Link from 'next/link'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Item, ItemActions, ItemContent, ItemTitle } from '@/components/ui/item'
import { accountPages } from '@/lib/account/pages'
import { itemName, matchesTyped, textIn } from '@/lib/account/synced-views'
import { countOf, fill } from '@/lib/i18n/format'
import { localizedPath } from '@/lib/i18n/paths'
import { ListActions } from './lists'
import { type AreaProps, Filter, ItemLink, Rows, useChanging } from './parts'

export function ListWords(props: AreaProps & { listId: string }) {
  const { copy, locale, text, change, listId } = props
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
  const shownList = { ...list, data: list.data }
  const name = textIn(list.data, 'name')
  const inList = wordsOfList(copy.held('listWord'), listId)
  const shown = inList.filter(word => matchesTyped(word.data, typed))
  const isKnown = (itemId: string) => copy.heldOne('knownWord', itemId)?.data?.known === true
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
        <ListActions list={shownList} wordCount={inList.length} props={props} />
      </div>
      {inList.length > 0 ? (
        <Filter id="list-filter" label={words.search} value={typed} onChange={setTyped} />
      ) : null}
      <Rows empty={empty} problem={problem}>
        {shown.map(word => (
          <Item key={word.entityId} variant="outline">
            <ItemContent>
              <ItemTitle>
                <ItemLink data={word.data} locale={locale} />
                {isKnown(textIn(word.data, 'itemId')) ? (
                  <Badge variant="secondary">{words.known}</Badge>
                ) : null}
              </ItemTitle>
            </ItemContent>
            <ItemActions>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                aria-label={fill(words.removeNamed, { name: itemName(word.data) })}
                onClick={() => void run(() => change('listWord', 'remove', word.entityId))}
              >
                {words.remove}
              </Button>
            </ItemActions>
          </Item>
        ))}
      </Rows>
    </section>
  )
}
