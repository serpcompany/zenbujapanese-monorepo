'use client'

import { listsInOrder, wordsOfList } from '@zenbu/account-rules/account-views'
import { dailyListGroups, localDay } from '@/lib/account/daily-lists'
import { listPath } from '@/lib/account/synced-views'
import { countOf } from '@/lib/i18n/format'
import { BackToLists, ListRow } from './lists'
import { type AreaProps, Rows } from './parts'

export function DailyLists({ copy, locale, text }: AreaProps) {
  const words = text.synced.lists
  const listWords = copy.held('listWord')
  const groups = dailyListGroups(
    listsInOrder(copy.held('list')),
    localDay(new Date()),
    locale,
    words
  )
  return (
    <section className="flex flex-col gap-4" aria-labelledby="daily-lists">
      <BackToLists locale={locale} words={words} />
      <h2 id="daily-lists" className="text-lg font-medium">
        {words.dailyLists}
      </h2>
      <Rows empty={groups.length === 0 ? words.noDailyLists : null} problem={null}>
        {groups.map(group => (
          <section key={group.heading} className="flex flex-col gap-2" aria-label={group.heading}>
            <h3 className="font-medium">{group.heading}</h3>
            {group.lists.map(({ list, title }) => (
              <ListRow
                key={list.entityId}
                href={listPath(list.entityId, locale)}
                title={title}
                description={countOf(
                  words.count,
                  wordsOfList(listWords, list.entityId).length,
                  locale
                )}
              />
            ))}
          </section>
        ))}
      </Rows>
    </section>
  )
}
