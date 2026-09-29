'use client'

import { useState } from 'react'
import type { RubySegment } from '@/lib/dictionary/detail/ruby'
import { graphemes } from '@/lib/dictionary/detail/text'

// The headword with furigana and the app's Furigana kanji highlight (JapaneseRubyText.swift):
// in a kanji run whose kanji readings split it one way, each kanji is a toggle that colors it and
// its part of the furigana (学 and がっ in 学校). Selecting it again clears the highlight;
// selecting another kanji moves it. The furigana stays compact, as in the app.

/** The app's accent color, which the selected kanji and its kana take. */
const accent = 'text-blue-600 dark:text-blue-400'

interface Selected {
  segment: number
  kanji: number
}

export function HeadwordRuby({
  segments,
  className
}: {
  segments: RubySegment[]
  className?: string
}) {
  const [selected, setSelected] = useState<Selected | null>(null)
  let offset = 0
  const keyed = segments.map((segment, index) => {
    const key = `${offset}`
    offset += segment.text.length
    return { segment, index, key }
  })
  return (
    <span lang="ja" className={className}>
      {keyed.map(({ segment, index, key }) => {
        const split = segment.kanjiReadings
        if (!segment.reading) return <span key={key}>{segment.text}</span>
        if (!split) {
          return (
            <ruby key={key}>
              {segment.text}
              <rt className="text-[0.45em] font-normal text-muted-foreground">{segment.reading}</rt>
            </ruby>
          )
        }
        const kanji = graphemes(segment.text)
        const isSelected = (position: number) =>
          selected?.segment === index && selected.kanji === position
        return (
          <ruby key={key} data-kanji-split={split.join('・')}>
            {kanji.map((character, position) => (
              <button
                // biome-ignore lint/suspicious/noArrayIndexKey: a kanji can repeat, so its position is its identity.
                key={position}
                type="button"
                aria-pressed={isSelected(position)}
                aria-label={`${character}, ${split[position]}`}
                data-kanji={character}
                data-kanji-reading={split[position]}
                className={`cursor-pointer rounded-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none ${isSelected(position) ? accent : ''}`}
                onClick={() =>
                  setSelected(isSelected(position) ? null : { segment: index, kanji: position })
                }
              >
                {character}
              </button>
            ))}
            <rt className="text-[0.45em] font-normal text-muted-foreground">
              {split.map((part, position) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: parts can repeat, as kanji can.
                  key={position}
                  className={`transition-colors motion-reduce:transition-none ${isSelected(position) ? accent : ''}`}
                >
                  {part}
                </span>
              ))}
            </rt>
          </ruby>
        )
      })}
    </span>
  )
}
