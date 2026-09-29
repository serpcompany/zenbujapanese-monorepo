'use client'

import type { RubySegment } from '@zenbu/dictionary-core/detail/ruby'
import { graphemes } from '@zenbu/dictionary-core/detail/text'
import { useState } from 'react'

// A headword with furigana and the app's Furigana kanji highlight (JapaneseRubyText.swift): in a
// kanji run whose kanji readings split it one way, each kanji is a toggle that colors it and its
// part of the furigana (学 and がっ in 学校). Selecting it again clears the highlight; selecting
// another kanji moves it. The furigana stays compact, as in the app. A conjugated form's changed
// ending (`highlightedEnding`) is drawn in the accent color too, as JapaneseRubyText draws it.

/** The app's accent color, which the selected kanji and its kana take. */
export const accent = 'text-blue-600 dark:text-blue-400'

interface Selected {
  segment: number
  kanji: number
}

/**
 * `text`, which starts `offset` Characters into the headword, with the Characters from
 * `endingStart` on in the accent color.
 */
function Ending({
  text,
  offset,
  endingStart
}: {
  text: string
  offset: number
  endingStart: number
}) {
  const characters = graphemes(text)
  const split = Math.max(0, endingStart - offset)
  if (split >= characters.length) return text
  return (
    <>
      {characters.slice(0, split).join('')}
      <span className={accent} data-ending>
        {characters.slice(split).join('')}
      </span>
    </>
  )
}

export function HeadwordRuby({
  segments,
  className,
  highlightedEnding = '',
  highlightsKanji = true
}: {
  segments: RubySegment[]
  className?: string
  /** A trailing part of the headword drawn in the accent color, such as a conjugation's ending. */
  highlightedEnding?: string
  /** Off where the text is itself inside a control, such as a conjugation row. */
  highlightsKanji?: boolean
}) {
  const [selected, setSelected] = useState<Selected | null>(null)
  const surface = segments.map(segment => segment.text).join('')
  const length = graphemes(surface).length
  const endingStart = surface.endsWith(highlightedEnding)
    ? length - graphemes(highlightedEnding).length
    : length
  let offset = 0
  const keyed = segments.map((segment, index) => {
    const start = offset
    offset += graphemes(segment.text).length
    return { segment, index, start }
  })
  return (
    <span lang="ja" className={className}>
      {keyed.map(({ segment, index, start }) => {
        const key = `${start}`
        const split = highlightsKanji ? segment.kanjiReadings : undefined
        const text = <Ending text={segment.text} offset={start} endingStart={endingStart} />
        if (!segment.reading) return <span key={key}>{text}</span>
        if (!split) {
          return (
            <ruby key={key}>
              {text}
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
                className={`cursor-pointer rounded-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none ${isSelected(position) || start + position >= endingStart ? accent : ''}`}
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
