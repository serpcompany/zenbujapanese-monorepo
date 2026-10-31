import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle
} from '@zenbu/ui/components/item'
import { useMemo } from 'react'
import { glossCache } from '../page-lookup/glosses'
import type { WordState } from '../shared/account-copy'
import { useSettings } from '../shared/use-settings'
import { onDeviceServices } from '../translate/services'
import { type SourceServices, useFetchedGlosses } from '../translate/source-words'
import { InlineCard } from '../word-popup/inline-card'
import { fromKeys, keepPress, usePickedWord } from '../word-popup/panel-word'
import { StateTagView } from '../word-saving/word-menu'
import { savedWordsLabels as labels } from './labels'

export type SavedWordServices = Pick<SourceServices, 'popupCard' | 'pagePopup'>

const savedWordServices: SavedWordServices = {
  popupCard: onDeviceServices.popupCard,
  pagePopup: onDeviceServices.pagePopup
}

export type SavedRow = {
  key: string
  item: string
  headword: string
  reading: string
  state: WordState
  note?: string
}

type Opened = { text: string; ids: readonly string[]; key: string; element: HTMLElement }

const isKanji = (item: string) => item.startsWith('kanji:')

const named = ({ headword, reading }: SavedRow) =>
  reading && reading !== headword ? `${headword}【${reading}】` : headword

function RowContent({ row, description }: { row: SavedRow; description?: string }) {
  return (
    <>
      <ItemContent className="min-w-0">
        <ItemTitle lang="ja" className="w-full truncate">
          {named(row)}
        </ItemTitle>
        {description && <ItemDescription>{description}</ItemDescription>}
      </ItemContent>
      <ItemActions>
        <StateTagView state={row.state} />
      </ItemActions>
    </>
  )
}

const focusBack = (word: Opened) => word.element.focus({ preventScroll: true })

export function WordRows({
  rows,
  services = savedWordServices
}: {
  rows: SavedRow[]
  services?: SavedWordServices
}) {
  const settings = useSettings()
  const cache = useMemo(() => glossCache(id => services.popupCard(id, [])), [services])
  const ids = useMemo(
    () => [...new Set(rows.filter(row => !isKanji(row.item)).map(row => row.item))],
    [rows]
  )
  const glosses = useFetchedGlosses(ids, cache)
  const { picked, pick } = usePickedWord(focusBack, services.pagePopup)
  return (
    <ul className="flex flex-col gap-2">
      {rows.map(row => (
        <li key={row.key} className="flex flex-col gap-2">
          {isKanji(row.item) ? (
            <Item variant="outline" size="sm" data-saved-kanji={row.item}>
              <RowContent row={row} description={row.note ?? labels.kanji} />
            </Item>
          ) : (
            <Item
              variant="outline"
              size="sm"
              render={
                <button
                  type="button"
                  data-saved-word={row.item}
                  onPointerDown={keepPress}
                  onClick={event =>
                    pick(
                      {
                        text: row.headword,
                        ids: [row.item],
                        key: row.key,
                        element: event.currentTarget
                      },
                      event.currentTarget,
                      fromKeys(event)
                    )
                  }
                />
              }
              className="w-full cursor-pointer text-left"
            >
              <RowContent row={row} description={row.note ?? glosses.get(row.item)?.full} />
            </Item>
          )}
          {picked?.at === 'inline' && picked.word.key === row.key && settings && (
            <InlineCard
              key={picked.id}
              word={picked.word}
              settings={settings}
              popupCard={services.popupCard}
            />
          )}
        </li>
      ))}
    </ul>
  )
}
