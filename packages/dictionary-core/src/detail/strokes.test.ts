import { describe, expect, test } from 'vitest'
import { fixtureKanjiRows } from '../fixtures'
import { kanjiDetail } from './kanji'
import { decodeStroke, strokeDiagram, strokeOrder } from './strokes'

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

describe('strokeDiagram', () => {
  test('gives each stroke as the points a client draws through', () => {
    expect(
      strokeDiagram({
        viewportSize: 109,
        strokeCount: 1,
        strokes: [[0, 11, 54.25, 1, 14.19, 54.87, 17.25, 55, 20.73, 54.75]]
      })
    ).toEqual({
      viewportSize: 109,
      strokes: [
        [
          { end: { x: 11, y: 54.25 }, controls: null },
          {
            end: { x: 20.73, y: 54.75 },
            controls: [
              { x: 14.19, y: 54.87 },
              { x: 17.25, y: 55 }
            ]
          }
        ]
      ]
    })
  })

  test.each([
    ['a stroke that begins with a curve', 1, [[1, 1, 2, 3, 4, 5, 6]], 'does not begin with a move'],
    ['an unknown opcode', 1, [[0, 1, 2, 2, 1, 2]], 'unknown path opcode'],
    ['a stroke count that differs', 2, [[0, 1, 2]], 'stroke-count mismatch'],
    ['no strokes', 0, [], 'stroke-count mismatch']
  ])('rejects %s', (_, strokeCount, strokes, message) => {
    expect(() => strokeDiagram({ viewportSize: 109, strokeCount, strokes })).toThrow(message)
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
