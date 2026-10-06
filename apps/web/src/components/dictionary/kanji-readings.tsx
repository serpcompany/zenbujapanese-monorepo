import { ChevronRightIcon } from 'lucide-react'
import Link from 'next/link'
import { Item } from '@/components/ui/item'
import type { KanjiDetailsData } from '@/lib/dictionary/kanji-details'

type Reading = KanjiDetailsData['readings'][number]

function readingLabel(reading: Reading): string | null {
  const first = reading.words[0]
  return first
    ? `${reading.label} reading ${reading.value}, ${first.headword}, ${first.summary}`
    : null
}

function ReadingContent({ reading, opens }: { reading: Reading; opens: boolean }) {
  return (
    <>
      <span className="font-medium">{reading.label}</span>
      <span lang="ja" className="text-right text-lg">
        {reading.value}
      </span>
      <span className="flex w-4 justify-end">
        {opens ? <ChevronRightIcon className="size-4 text-muted-foreground" /> : null}
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
}

export function KanjiReadings({ readings }: { readings: Reading[] }) {
  return (
    <div className="-mx-3 flex flex-col divide-y">
      {readings.map(reading => {
        const path = reading.words[0]?.path ?? null
        const label = readingLabel(reading)
        const className = 'grid grid-cols-[3.5rem_minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-base'
        const id = `${reading.kind}.${reading.value}`
        return path && label ? (
          <Item
            key={id}
            className={className}
            data-kanji-reading={id}
            render={<Link href={path} aria-label={label} />}
          >
            <ReadingContent reading={reading} opens />
          </Item>
        ) : (
          <Item key={id} className={className} data-kanji-reading={id}>
            <ReadingContent reading={reading} opens={false} />
          </Item>
        )
      })}
    </div>
  )
}
