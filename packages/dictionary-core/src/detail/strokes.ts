// A kanji's stroke order, as the app decodes it (KanjiStrokeOrderClient.swift's `decodeStroke`)
// and draws it (KanjiStrokeOrderView.swift's `KanjiStrokeShape`).

import type { KanjiStrokesRow } from './rows'

export interface StrokePoint {
  x: number
  y: number
}

export interface Stroke {
  /** The stroke as an SVG path in the diagram's viewport: moves and cubic curves. */
  path: string
  /** Where the stroke begins, which the app marks with a dot before drawing it. */
  start: StrokePoint
}

export interface StrokeOrder {
  /** The side of the square viewport the paths are drawn in (109 for KanjiVG). */
  viewportSize: number
  strokes: Stroke[]
}

/**
 * `decodeStroke`: opcode 0 moves to a point, opcode 1 draws a cubic curve through two control
 * points to an end point. Like the app, a stroke that doesn't begin with a move, or any other
 * malformed path, is an error rather than a partial drawing.
 */
export function decodeStroke(encoded: readonly number[]): Stroke {
  const commands: string[] = []
  let start: StrokePoint | null = null
  let index = 0
  while (index < encoded.length) {
    const opcode = encoded[index]
    index += 1
    if (opcode === 0) {
      if (index + 1 >= encoded.length) throw new Error('incomplete move command')
      const [x, y] = encoded.slice(index, index + 2)
      if (commands.length === 0) start = { x, y }
      commands.push(`M${x} ${y}`)
      index += 2
    } else if (opcode === 1) {
      if (index + 5 >= encoded.length) throw new Error('incomplete cubic command')
      commands.push(`C${encoded.slice(index, index + 6).join(' ')}`)
      index += 6
    } else {
      throw new Error('unknown path opcode')
    }
  }
  if (!start) throw new Error('stroke does not begin with a move')
  return { path: commands.join(''), start }
}

/** The diagram, checked against its stroke count as the app checks it. */
export function strokeOrder(row: KanjiStrokesRow): StrokeOrder {
  const strokes = row.strokes.map(decodeStroke)
  if (strokes.length === 0 || strokes.length !== row.strokeCount) {
    throw new Error('stroke-count mismatch')
  }
  return { viewportSize: row.viewportSize, strokes }
}
