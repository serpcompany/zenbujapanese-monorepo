// Ports the pitch accent the word card draws: `String.morae` and `PitchAccent.levels` in
// DictionaryEntry.swift, over the reading in katakana (WordDetailView.swift's PitchAccentBadge).

import type { PitchRow } from './rows'
import { graphemes, katakana } from './text'

export interface PitchAccent {
  /** The reading's morae in katakana, each high or low. */
  morae: { mora: string; high: boolean }[]
  /** 0 for flat; otherwise the mora after which pitch falls. */
  downstep: number
  /** The pitch of a following particle such as が: high only when flat. */
  particleHigh: boolean
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

/** The word card's pitch, over the reading's own morae as the app counts them. */
export function pitchAccent(reading: string, pitch: PitchRow): PitchAccent {
  const kana = morae(katakana(reading))
  const levels = pitchLevels(pitch.downstep, kana.length)
  return {
    morae: kana.map((mora, index) => ({ mora, high: levels.morae[index] })),
    downstep: pitch.downstep,
    particleHigh: levels.particle
  }
}
