import type { KanjiReading } from '@zenbu/dictionary-core/detail/kanji'
import { romaji } from '@zenbu/dictionary-core/detail/romaji'
import { glossSeparator } from '@zenbu/dictionary-core/detail/sections'
import { ChevronRightIcon } from 'lucide-react'
import { Item } from '../components/item'
import { RomajiLine } from './reading-aid-lines'
import { SourceText } from './source-text'
import type { RenderWordLink } from './word-link'

function ReadingContent({
  reading,
  opens,
  lang
}: {
  reading: KanjiReading
  opens: boolean
  lang?: string
}) {
  return (
    <>
      <span className="font-medium">{reading.label}</span>
      <span lang="ja" className="text-right text-lg">
        {reading.value}
        <RomajiLine romaji={romaji(reading.value)} className="text-sm" />
      </span>
      <span className="flex w-4 justify-end">
        {opens ? <ChevronRightIcon className="size-4 text-muted-foreground" /> : null}
      </span>
      {reading.words.length > 0 ? (
        <span className="col-span-2 col-start-2 flex flex-wrap gap-x-3 text-muted-foreground">
          {reading.words.map(word => (
            <span key={word.entSeq}>
              <span lang="ja">{word.headword}</span>
              {glossSeparator}
              <SourceText text={word.summary} lang={lang} />
            </span>
          ))}
        </span>
      ) : null}
    </>
  )
}

export function KanjiReadings({
  readings,
  lang,
  renderWordLink
}: {
  readings: KanjiReading[]
  lang?: string
  renderWordLink: RenderWordLink
}) {
  return (
    <div className="-mx-3 flex flex-col divide-y">
      {readings.map(reading => {
        const first = reading.words[0]
        const link =
          first && reading.spoken
            ? renderWordLink({ target: { entSeq: first.entSeq }, 'aria-label': reading.spoken })
            : null
        const className = 'grid grid-cols-[3.5rem_minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-base'
        const id = `${reading.kind}.${reading.value}`
        return link ? (
          <Item key={id} className={className} data-kanji-reading={id} render={link}>
            <ReadingContent reading={reading} opens lang={lang} />
          </Item>
        ) : (
          <Item key={id} className={className} data-kanji-reading={id}>
            <ReadingContent reading={reading} opens={false} lang={lang} />
          </Item>
        )
      })}
    </div>
  )
}
