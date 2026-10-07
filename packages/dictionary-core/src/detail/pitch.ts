import type { PitchRow } from './rows'
import { graphemes, katakana } from './text'

interface PitchPoint {
  x: number
  high: boolean
}

interface PitchGraph {
  widths: number[]
  points: PitchPoint[]
  particle: PitchPoint
  width: number
}

export interface PitchAccent {
  morae: { mora: string; high: boolean }[]
  downstep: number
  moraCount: number
  particleHigh: boolean
  graph: PitchGraph
}

const joinsPreviousMora = new Set('ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ')
const heiban = 0
const atamadaka = 1
const moraWidth = 1
const combinedMoraWidth = 1.5

export function morae(kana: string): string[] {
  const result: string[] = []
  for (const character of graphemes(kana)) {
    const last = result.at(-1)
    if (joinsPreviousMora.has(character) && last !== undefined)
      result[result.length - 1] = last + character
    else result.push(character)
  }
  return result
}

export function pitchLevels(
  downstep: number,
  count: number
): { morae: boolean[]; particle: boolean } {
  const levels = Array.from({ length: count }, (_, index) =>
    downstep === heiban
      ? index > 0
      : downstep === atamadaka
        ? index === 0
        : index > 0 && index < downstep
  )
  return { morae: levels, particle: downstep === heiban }
}

const particleWidth = 0.6

function pitchGraph(
  kana: readonly string[],
  levels: { morae: boolean[]; particle: boolean }
): PitchGraph {
  const widths = kana.map(mora => (graphemes(mora).length > 1 ? combinedMoraWidth : moraWidth))
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

export function pitchAccent(reading: string, pitch: PitchRow): PitchAccent {
  const kana = morae(katakana(reading))
  const levels = pitchLevels(pitch.downstep, kana.length)
  return {
    morae: kana.map((mora, index) => ({ mora, high: levels.morae[index] })),
    downstep: pitch.downstep,
    moraCount: pitch.moraCount,
    particleHigh: levels.particle,
    graph: pitchGraph(kana, levels)
  }
}
