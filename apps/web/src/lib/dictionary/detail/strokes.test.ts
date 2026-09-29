import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { fixtureKanjiRows } from '@/lib/dictionary/fixtures'
import { kanjiDetail } from './kanji'
import { decodeStroke, strokeOrder } from './strokes'

// KanjiStrokeOrderClient.swift's decodeStroke and its stroke-count check.

describe('decodeStroke', () => {
  test('一: a move, then cubic curves, as an SVG path starting where the app puts its dot', () => {
    expect(decodeStroke([0, 11, 54.25, 1, 14.19, 54.87, 17.25, 55, 20.73, 54.75])).toEqual({
      path: 'M11 54.25C14.19 54.87 17.25 55 20.73 54.75',
      start: { x: 11, y: 54.25 }
    })
  })

  test.each([
    ['a stroke that begins with a curve', [1, 1, 2, 3, 4, 5, 6], 'does not begin with a move'],
    ['an incomplete move', [0, 11], 'incomplete move command'],
    ['an incomplete curve', [0, 1, 2, 1, 1, 2, 3], 'incomplete cubic command'],
    ['an unknown opcode', [0, 1, 2, 2, 1, 2], 'unknown path opcode'],
    ['no commands', [], 'does not begin with a move']
  ])('rejects %s', (_, encoded, message) => {
    expect(() => decodeStroke(encoded)).toThrow(message)
  })
})

describe('strokeOrder', () => {
  test('rejects a diagram whose stroke count differs', () => {
    expect(() => strokeOrder({ viewportSize: 109, strokeCount: 2, strokes: [[0, 1, 2]] })).toThrow(
      'stroke-count mismatch'
    )
  })

  test('要 has nine strokes in a 109-unit square', () => {
    const kaname = fixtureKanjiRows.find(rows => rows.kanji.character === '要')
    const order = kaname && kanjiDetail(kaname).strokeOrder
    expect(order?.viewportSize).toBe(109)
    expect(order?.strokes).toHaveLength(9)
    expect(order?.strokes[0].path.startsWith('M21 17.24C')).toBe(true)
  })
})

describe('kanjiDetail with undecodable stroke data', () => {
  test('shows no stroke order rather than failing the page, as the app shows none', () => {
    const kaname = fixtureKanjiRows.find(rows => rows.kanji.character === '要')
    if (!kaname) throw new Error('no fixture for 要')
    const detail = kanjiDetail({
      ...kaname,
      strokes: { viewportSize: 109, strokeCount: 1, strokes: [[]] }
    })
    expect(detail.strokeOrder).toBeNull()
    expect(detail.words).toHaveLength(24)
  })
})

describe('the import refuses what decodeStroke rejects', () => {
  // scripts/release-d1/dictionary/language_data.py's stroke_problem, run on the same strokes.
  const scripts = fileURLToPath(
    new URL('../../../../scripts/release-d1/dictionary', import.meta.url)
  )
  const importable = (strokes: number[][]): boolean[] =>
    JSON.parse(
      execFileSync(
        'python3',
        [
          '-c',
          'import json, sys; from language_data import stroke_problem; ' +
            'print(json.dumps([stroke_problem(s) is None for s in json.loads(sys.argv[1])]))',
          JSON.stringify(strokes)
        ],
        { cwd: scripts, encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } }
      )
    )

  test('accepts the strokes the app decodes and refuses the rest, including an empty stroke', () => {
    const strokes = [
      [0, 11, 54.25, 1, 14.19, 54.87, 17.25, 55, 20.73, 54.75],
      [],
      [1, 1, 2, 3, 4, 5, 6],
      [0, 11],
      [0, 1, 2, 1, 1, 2, 3],
      [0, 1, 2, 2, 1, 2]
    ]
    const decodable = strokes.map(stroke => {
      try {
        decodeStroke(stroke)
        return true
      } catch {
        return false
      }
    })
    expect(importable(strokes)).toEqual([true, false, false, false, false, false])
    expect(importable(strokes)).toEqual(decodable)
  })
})
