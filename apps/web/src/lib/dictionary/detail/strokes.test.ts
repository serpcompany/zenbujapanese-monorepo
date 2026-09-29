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
