import { ChevronRightIcon } from 'lucide-react'
import Link from 'next/link'
import { Item } from '@/components/ui/item'
import type { KanjiPageData } from '@/lib/dictionary/data'

type Reading = KanjiPageData['readings'][number]

/**
 * `KanjiReadingsSection` in KanjiDetailView.swift: each reading beside its kind, with up to three
 * of the kanji's words read that way. A row with words opens the first one, as the app's row does,
 * and screen readers hear the app's label for it; a row without words opens nothing.
 */
export function KanjiReadings({ readings }: { readings: Reading[] }) {
  return (
    <div className="-mx-3 -my-2.5 flex flex-col divide-y">
      {readings.map(reading => {
        const destination = reading.words[0]
        const path = destination?.path ?? null
        const content = (
          <>
            <span className="font-medium">{reading.label}</span>
            <span lang="ja" className="text-right text-lg">
              {reading.value}
            </span>
            <span className="flex w-4 justify-end">
              {path ? <ChevronRightIcon className="size-4 text-muted-foreground" /> : null}
            </span>
            {reading.words.length > 0 ? (
              <span className="col-span-2 col-start-2 flex flex-wrap gap-x-3 text-muted-foreground">
                {reading.words.map(word => (
                  <span key={word.entSeq}>
                    <span lang="ja">{word.headword}</span> · {word.summary}
                  </span>
                ))}
              </span>
            ) : null}
          </>
        )
        const className = 'grid grid-cols-[3.5rem_minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-base'
        return path && destination ? (
          <Item
            key={`${reading.kind}${reading.value}`}
            className={className}
            data-kanji-reading={`${reading.kind}.${reading.value}`}
            render={
              <Link
                href={path}
                aria-label={`${reading.label} reading ${reading.value}, ${destination.headword}, ${destination.summary}`}
              />
            }
          >
            {content}
          </Item>
        ) : (
          <Item
            key={`${reading.kind}${reading.value}`}
            className={className}
            data-kanji-reading={`${reading.kind}.${reading.value}`}
          >
            {content}
          </Item>
        )
      })}
    </div>
  )
}
