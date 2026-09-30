'use client'

import type { PitchAccent as PitchAccentData } from '@zenbu/dictionary-core/detail/pitch'
import { Volume2Icon } from 'lucide-react'
import { speakJapanese } from './pronounce-button'

const moraWidthEm = 1.25
const contourHeightEm = 2.4
const svgUnitsPerMora = 100
const dotRadius = 12.5
const dotInsetFromEdge = dotRadius + 5

export function PitchAccent({ pitch, reading }: { pitch: PitchAccentData; reading: string }) {
  const { graph } = pitch
  const viewHeight = (contourHeightEm / moraWidthEm) * svgUnitsPerMora
  const y = (high: boolean) => (high ? dotInsetFromEdge : viewHeight - dotInsetFromEdge)
  const points = graph.points.map(point => ({
    cx: Math.round(point.x * svgUnitsPerMora),
    cy: y(point.high)
  }))
  const particle = {
    cx: Math.round(graph.particle.x * svgUnitsPerMora),
    cy: y(graph.particle.high)
  }
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
        style={{ height: `${contourHeightEm}em`, width: `${graph.width * moraWidthEm}em` }}
      >
        {morae.map(mora => (
          <span
            key={mora.key}
            className="text-center leading-none"
            style={{ width: `${mora.width * moraWidthEm}em` }}
          >
            {mora.mora}
          </span>
        ))}
        <svg
          className="absolute inset-0 size-full overflow-visible text-red-600 dark:text-red-400"
          viewBox={`0 0 ${Math.round(graph.width * svgUnitsPerMora)} ${viewHeight}`}
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
