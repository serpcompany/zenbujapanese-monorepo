import type { KanjiStrokesRow } from './rows'

interface StrokePoint {
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

interface StrokeSegment {
  end: StrokePoint
  controls: [StrokePoint, StrokePoint] | null
}

export interface StrokeOrderLabels {
  title: string
  show: string
  grid: string
  previous: string
  play: string
  pause: string
  next: string
  position: string[]
  complete: string[]
  completeOf: string[]
  drawing: string[]
}

export interface StrokeDiagram {
  viewportSize: number
  strokes: StrokeSegment[][]
  labels: StrokeOrderLabels
}

const counts = (last: number) => Array.from({ length: last + 1 }, (_, index) => index)

export function strokeOrderLabels(character: string, strokeCount: number): StrokeOrderLabels {
  const completed = counts(strokeCount)
  return {
    title: 'Stroke Order',
    show: `Show stroke order for ${character}`,
    grid: `Stroke drawing grid for ${character}`,
    previous: 'Previous stroke',
    play: 'Play stroke order',
    pause: 'Pause stroke order',
    next: 'Next stroke',
    position: completed.map(done => `Stroke ${Math.min(done + 1, strokeCount)} of ${strokeCount}`),
    complete: completed.map(done => `${done} strokes complete`),
    completeOf: completed.map(done => `${done} of ${strokeCount} complete`),
    drawing: completed.map(done => `${done} strokes complete, drawing stroke ${done + 1}`)
  }
}

const moveOpcode = 0
const cubicOpcode = 1

const point = (encoded: readonly number[], index: number): StrokePoint => ({
  x: encoded[index],
  y: encoded[index + 1]
})

function strokeSegments(encoded: readonly number[]): StrokeSegment[] {
  const segments: StrokeSegment[] = []
  let index = 0
  while (index < encoded.length) {
    const opcode = encoded[index]
    index += 1
    if (opcode === moveOpcode) {
      if (index + 1 >= encoded.length) throw new Error('incomplete move command')
      segments.push({ end: point(encoded, index), controls: null })
      index += 2
    } else if (opcode === cubicOpcode) {
      if (index + 5 >= encoded.length) throw new Error('incomplete cubic command')
      segments.push({
        end: point(encoded, index + 4),
        controls: [point(encoded, index), point(encoded, index + 2)]
      })
      index += 6
    } else {
      throw new Error('unknown path opcode')
    }
  }
  if (segments.length === 0 || segments[0].controls !== null) {
    throw new Error('stroke does not begin with a move')
  }
  return segments
}

const written = ({ x, y }: StrokePoint) => `${x} ${y}`

export function decodeStroke(encoded: readonly number[]): Stroke {
  const segments = strokeSegments(encoded)
  return {
    path: segments
      .map(({ end, controls }) =>
        controls ? `C${[...controls, end].map(written).join(' ')}` : `M${written(end)}`
      )
      .join(''),
    start: segments[0].end
  }
}

function checkStrokeCount(row: KanjiStrokesRow): void {
  if (row.strokes.length === 0 || row.strokes.length !== row.strokeCount) {
    throw new Error('stroke-count mismatch')
  }
}

export function strokeOrder(row: KanjiStrokesRow): StrokeOrder {
  const strokes = row.strokes.map(decodeStroke)
  checkStrokeCount(row)
  return { viewportSize: row.viewportSize, strokes }
}

export function strokeDiagram(row: KanjiStrokesRow & { character: string }): StrokeDiagram {
  const strokes = row.strokes.map(strokeSegments)
  checkStrokeCount(row)
  return {
    viewportSize: row.viewportSize,
    strokes,
    labels: strokeOrderLabels(row.character, strokes.length)
  }
}
