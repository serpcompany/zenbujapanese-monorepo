// The word-detail conformance suite's shapes for what the detail core computes, so the import's
// gate (conformance.test.ts) and the rendered word page's test (word-page.test.tsx) compare the
// same fields the app records in WordDetailConformanceTests.swift. Test-only.

import type { FrequencyDetails } from './frequency'
import type { PitchAccent } from './pitch'
import type { RubySegment } from './ruby'

/** `furigana[]`: each segment, with the per-kanji split tapping a kanji highlights. */
export interface SuiteFurigana {
  base: string
  reading?: string
  kanjiReadings?: string[]
}

/**
 * `pitch.graph`, PitchContourLayout: the morae drawn, then each point, `x` in hundredths of a mora
 * width, high (H) or low (L).
 */
export interface SuitePitchGraph {
  morae: string[]
  points: { x: number; level: string }[]
  particle: { x: number; level: string }
}

/** `frequency[].details`, FrequencyDisclosurePresentation: what a Frequency row opens. */
export interface SuiteFrequencyDetails {
  pack?: { name: string; domain: string; description: string; version: string; source: string }
  section: string
  rows: { label: string; value: string }[]
  explanation?: string
}

export function suiteFurigana(ruby: readonly RubySegment[]): SuiteFurigana[] {
  return ruby.map(({ text, reading, kanjiReadings }) => ({
    base: text,
    ...(reading === undefined ? {} : { reading }),
    ...(kanjiReadings === undefined ? {} : { kanjiReadings })
  }))
}

const suitePoint = (point: { x: number; high: boolean }) => ({
  x: Math.round(point.x * 100),
  level: point.high ? 'H' : 'L'
})

export function suitePitchGraph(pitch: PitchAccent): SuitePitchGraph {
  return {
    morae: pitch.morae.map(({ mora }) => mora),
    points: pitch.graph.points.map(suitePoint),
    particle: suitePoint(pitch.graph.particle)
  }
}

export function suiteFrequencyDetails(details: FrequencyDetails): SuiteFrequencyDetails {
  return {
    pack: details.pack,
    section: details.section,
    rows: details.rows,
    ...(details.explanation === null ? {} : { explanation: details.explanation })
  }
}
