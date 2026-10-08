'use client'

import type { RubySegment } from '@zenbu/dictionary-core/detail/ruby'
import { graphemes } from '@zenbu/dictionary-core/detail/text'
import { useState } from 'react'
import { accent } from './accent'

interface Selected {
  segment: number
  kanji: number
}

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

const readingClass = 'furigana font-normal text-muted-foreground'

function Reading({
  text,
  outsideText,
  className = ''
}: {
  text: string
  outsideText: boolean
  className?: string
}) {
  if (!outsideText) return <span className={className}>{text}</span>
  return <span data-reading={text} className={`before:content-[attr(data-reading)] ${className}`} />
}

export function HeadwordRuby({
  segments,
  className,
  highlightedEnding = '',
  highlightsKanji = true,
  readingsOutsideText = false,
  initiallySelected = null
}: {
  segments: RubySegment[]
  className?: string
  highlightedEnding?: string
  highlightsKanji?: boolean
  readingsOutsideText?: boolean
  initiallySelected?: Selected | null
}) {
  const [selected, setSelected] = useState<Selected | null>(initiallySelected)
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
              <rt className={readingClass}>
                {readingsOutsideText ? (
                  <Reading text={segment.reading} outsideText />
                ) : (
                  segment.reading
                )}
              </rt>
            </ruby>
          )
        }
        const kanji = graphemes(segment.text).map((character, position) => ({
          character,
          position
        }))
        const readingParts = split.map((part, position) => ({ part, position }))
        const isSelected = (position: number) =>
          selected?.segment === index && selected.kanji === position
        return (
          <ruby key={key} data-kanji-split={split.join('・')}>
            {kanji.map(({ character, position }) => (
              <button
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
            <rt className={readingClass}>
              {readingParts.map(({ part, position }) => (
                <Reading
                  key={position}
                  text={part}
                  outsideText={readingsOutsideText}
                  className={`transition-colors motion-reduce:transition-none ${isSelected(position) ? accent : ''}`}
                />
              ))}
            </rt>
          </ruby>
        )
      })}
    </span>
  )
}
