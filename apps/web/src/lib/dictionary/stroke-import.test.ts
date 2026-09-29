import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { decodeStroke } from '@zenbu/dictionary-core/detail/strokes'
import { describe, expect, test } from 'vitest'

// The dictionary import (scripts/release-d1) refuses a stroke diagram exactly when the app's
// KanjiStrokeOrderClient.swift decodeStroke, ported in the core's detail/strokes.ts, rejects it.

describe('the import refuses what decodeStroke rejects', () => {
  // scripts/release-d1/dictionary/language_data.py's stroke_problem, run on the same strokes.
  const scripts = fileURLToPath(new URL('../../../scripts/release-d1/dictionary', import.meta.url))
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
