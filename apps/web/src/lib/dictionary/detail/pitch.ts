// Ports the pitch accent the word card draws: `String.morae` and `PitchAccent.levels` in
// DictionaryEntry.swift, over the reading in katakana, and `PitchContourLayout` in
// WordDetailView.swift, where PitchAccentBadge draws the contour. See also those files;
// .github/workflows/search-parity.yml makes the two sides change together, and the word-detail
// suite's `pitch.graph` checks this port against the app.

import type { PitchRow } from './rows'
import { graphemes, katakana } from './text'

/** A point of the contour, `x` mora widths from the left edge of the first mora. */
export interface PitchPoint {
  x: number
  high: boolean
}

/**
 * `PitchContourLayout`: each mora is one mora wide, or 1.5 for a combined mora such as キョ, and
 * the particle has 0.6 after the last. Points sit at the center of their room.
 */
export interface PitchGraph {
  /** Each mora's width, in mora widths. */
  widths: number[]
  /** One point per mora. */
  points: PitchPoint[]
  /** The following particle's hollow point. */
  particle: PitchPoint
  /** The contour's whole width, particle included, in mora widths. */
  width: number
}

export interface PitchAccent {
  /** The reading's morae in katakana, each high or low. */
  morae: { mora: string; high: boolean }[]
  /** 0 for flat; otherwise the mora after which pitch falls. */
  downstep: number
  /** The pitch of a following particle such as が: high only when flat. */
  particleHigh: boolean
  /** The dot-and-line contour the app draws over the morae. */
  graph: PitchGraph
}

const combining = new Set('ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ')

/** `String.morae`: small ya/yu/yo and small vowels join the kana before them; ッ, ン, ー don't. */
export function morae(kana: string): string[] {
  const result: string[] = []
  for (const character of graphemes(kana)) {
    const last = result.at(-1)
    if (combining.has(character) && last !== undefined) result[result.length - 1] = last + character
    else result.push(character)
  }
  return result
}

/**
 * `PitchAccent.levels(moraCount:)`: heiban (0) rises after the first mora and stays high into
 * the particle; atamadaka (1) is high on the first mora only; otherwise pitch is high from the
 * second mora through the downstep mora and low afterward, including the particle.
 */
export function pitchLevels(
  downstep: number,
  count: number
): { morae: boolean[]; particle: boolean } {
  const levels = Array.from({ length: count }, (_, index) =>
    downstep === 0 ? index > 0 : downstep === 1 ? index === 0 : index > 0 && index < downstep
  )
  return { morae: levels, particle: downstep === 0 }
}

/** `PitchContourLayout.particleWidth`. */
export const particleWidth = 0.6

/** `PitchContourLayout.init(reading:pitch:)`, over morae already split and leveled. */
export function pitchGraph(
  kana: readonly string[],
  levels: { morae: boolean[]; particle: boolean }
): PitchGraph {
  // A combined mora such as キョ needs more room than a single kana. Swift counts Characters.
  const widths = kana.map(mora => (graphemes(mora).length > 1 ? 1.5 : 1))
  let x = 0
  const points = widths.map((width, index) => {
    const point = { x: x + width / 2, high: levels.morae[index] }
    x += width
    return point
  })
  return {
    widths,
    points,
    particle: { x: x + particleWidth / 2, high: levels.particle },
    width: x + particleWidth
  }
}

/** The word card's pitch, over the reading's own morae as the app counts them. */
export function pitchAccent(reading: string, pitch: PitchRow): PitchAccent {
  const kana = morae(katakana(reading))
  const levels = pitchLevels(pitch.downstep, kana.length)
  return {
    morae: kana.map((mora, index) => ({ mora, high: levels.morae[index] })),
    downstep: pitch.downstep,
    particleHigh: levels.particle,
    graph: pitchGraph(kana, levels)
  }
}
