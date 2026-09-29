import { describe, expect, test } from 'vitest'
import { morae, pitchAccent, pitchLevels } from './pitch'

const unidic = 'UniDic for Contemporary Written Japanese 3.1.0'

describe('morae (String.morae)', () => {
  test('joins small kana to the kana before them; ッ, ン, and ー count alone', () => {
    expect(morae('キョウ')).toEqual(['キョ', 'ウ'])
    expect(morae('ヨウリョウ')).toEqual(['ヨ', 'ウ', 'リョ', 'ウ'])
    expect(morae('コーヒー')).toEqual(['コ', 'ー', 'ヒ', 'ー'])
    expect(morae('キッテ')).toEqual(['キ', 'ッ', 'テ'])
    expect(morae('ティーシャツ')).toEqual(['ティ', 'ー', 'シャ', 'ツ'])
  })
})

describe('pitchLevels (PitchAccent.levels)', () => {
  test('heiban rises after the first mora and stays high into the particle', () => {
    expect(pitchLevels(0, 2)).toEqual({ morae: [false, true], particle: true })
  })

  test('atamadaka is high on the first mora only', () => {
    expect(pitchLevels(1, 3)).toEqual({ morae: [true, false, false], particle: false })
  })

  test('otherwise high from the second mora through the downstep', () => {
    expect(pitchLevels(3, 4)).toEqual({ morae: [false, true, true, false], particle: false })
    // Odaka: high to the end, low on the particle.
    expect(pitchLevels(2, 2)).toEqual({ morae: [false, true], particle: false })
  })
})

describe('pitchAccent', () => {
  test('draws the reading in katakana', () => {
    // 要る (1546640), heiban.
    expect(pitchAccent('いる', { downstep: 0, moraCount: 2, sourceIdentity: unidic })).toEqual({
      morae: [
        { mora: 'イ', high: false },
        { mora: 'ル', high: true }
      ],
      downstep: 0,
      moraCount: 2,
      particleHigh: true,
      graph: {
        widths: [1, 1],
        points: [
          { x: 0.5, high: false },
          { x: 1.5, high: true }
        ],
        particle: { x: 2.3, high: true },
        width: 2.6
      }
    })
    // 要領 (1546850), downstep 3.
    expect(
      pitchAccent('ようりょう', { downstep: 3, moraCount: 4, sourceIdentity: unidic }).morae
    ).toEqual([
      { mora: 'ヨ', high: false },
      { mora: 'ウ', high: true },
      { mora: 'リョ', high: true },
      { mora: 'ウ', high: false }
    ])
    // 珈琲 (1049180): a katakana reading stays as it is.
    expect(
      pitchAccent('コーヒー', { downstep: 3, moraCount: 4, sourceIdentity: unidic }).morae.map(
        mora => mora.high
      )
    ).toEqual([false, true, true, false])
  })
})

describe('pitchGraph (PitchContourLayout)', () => {
  test('gives a combined mora one and a half widths, and the particle 0.6 after the last', () => {
    // 今日 (1579110), atamadaka: キョ is wider, so its point is at 0.75.
    const { graph } = pitchAccent('きょう', { downstep: 1, moraCount: 2, sourceIdentity: unidic })
    expect(graph.widths).toEqual([1.5, 1])
    expect(graph.points).toEqual([
      { x: 0.75, high: true },
      { x: 2, high: false }
    ])
    expect(graph.particle).toEqual({ x: 2.8, high: false })
    expect(graph.width).toBeCloseTo(3.1)
  })
})
