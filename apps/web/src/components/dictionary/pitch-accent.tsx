'use client'

import type { PitchAccent as PitchAccentData } from '@zenbu/dictionary-core/detail/pitch'
import { Volume2Icon } from 'lucide-react'
import { speakJapanese } from './pronounce-button'

// The word card's pitch accent, drawn as the app's PitchAccentBadge (WordDetailView.swift) draws
// it: the reading in katakana, one mora wide each (1.5 for a combined mora such as キョ), with a
// dot per mora at the top edge when high and the bottom edge when low, joined by a line, and a
// hollow dot for the following particle. The capsule is one button that pronounces the word.
// Where each point goes is the detail core's `graph` (PitchContourLayout).

/** A mora's width in em, as the app's 20 pt at body size. */
const moraWidth = 1.25
/** The contour's height in em: a line of text with room above and below for the dots. */
const height = 2.4
/** The SVG draws 100 units per mora width, so a point's `cx` is its x in hundredths. */
const unit = 100
const dotRadius = 12.5
/** High points sit this far below the top edge, and low points above the bottom. */
const inset = dotRadius + 5

export function PitchAccent({ pitch, reading }: { pitch: PitchAccentData; reading: string }) {
  const { graph } = pitch
  const viewHeight = (height / moraWidth) * unit
  const y = (high: boolean) => (high ? inset : viewHeight - inset)
  const points = graph.points.map(point => ({ cx: Math.round(point.x * unit), cy: y(point.high) }))
  const particle = { cx: Math.round(graph.particle.x * unit), cy: y(graph.particle.high) }
  let offset = 0
  const morae = pitch.morae.map((mora, index) => {
    const key = `${offset}`
    offset += graph.widths[index]
    return { ...mora, key, width: graph.widths[index] }
  })
  return (
    <button
      type="button"
      onClick={() => speakJapanese(reading)}
      className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full bg-muted px-4 py-1.5 outline-none transition-colors hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
    >
      <Volume2Icon aria-hidden className="size-4 shrink-0 text-blue-600 dark:text-blue-400" />
      <span className="sr-only">
        Pronounce {reading}. Pitch accent, downstep {pitch.downstep}, {pitch.moraCount} mora
      </span>
      <span
        aria-hidden
        lang="ja"
        data-pitch-graph
        className="relative inline-flex items-center text-lg"
        style={{ height: `${height}em`, width: `${graph.width * moraWidth}em` }}
      >
        {morae.map(mora => (
          <span
            key={mora.key}
            className="text-center leading-none"
            style={{ width: `${mora.width * moraWidth}em` }}
          >
            {mora.mora}
          </span>
        ))}
        <svg
          className="absolute inset-0 size-full overflow-visible text-red-600 dark:text-red-400"
          viewBox={`0 0 ${Math.round(graph.width * unit)} ${viewHeight}`}
          role="presentation"
        >
          <polyline
            points={[...points, particle].map(point => `${point.cx},${point.cy}`).join(' ')}
            fill="none"
            stroke="currentColor"
            strokeWidth={7.5}
            strokeLinejoin="round"
          />
          {points.map((point, index) => (
            <circle
              key={morae[index].key}
              cx={point.cx}
              cy={point.cy}
              r={dotRadius}
              fill="currentColor"
            />
          ))}
          <circle
            data-particle
            cx={particle.cx}
            cy={particle.cy}
            r={dotRadius}
            className="fill-muted"
            stroke="currentColor"
            strokeWidth={7.5}
          />
        </svg>
      </span>
    </button>
  )
}
