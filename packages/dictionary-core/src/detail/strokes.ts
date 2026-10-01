import type { KanjiStrokesRow } from './rows'

export interface StrokePoint {
  x: number
  y: number
}

export interface Stroke {
  path: string
  start: StrokePoint
}

export interface StrokeOrder {
  viewportSize: number
  strokes: Stroke[]
}

const moveOpcode = 0
const cubicOpcode = 1

export function decodeStroke(encoded: readonly number[]): Stroke {
  const commands: string[] = []
  let start: StrokePoint | null = null
  let index = 0
  while (index < encoded.length) {
    const opcode = encoded[index]
    index += 1
    if (opcode === moveOpcode) {
      if (index + 1 >= encoded.length) throw new Error('incomplete move command')
      const [x, y] = encoded.slice(index, index + 2)
      if (commands.length === 0) start = { x, y }
      commands.push(`M${x} ${y}`)
      index += 2
    } else if (opcode === cubicOpcode) {
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

export function strokeOrder(row: KanjiStrokesRow): StrokeOrder {
  const strokes = row.strokes.map(decodeStroke)
  if (strokes.length === 0 || strokes.length !== row.strokeCount) {
    throw new Error('stroke-count mismatch')
  }
  return { viewportSize: row.viewportSize, strokes }
}
