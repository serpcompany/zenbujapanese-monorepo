export interface Span {
  start: number
  end: number
}

export interface Comment {
  line: number
  column: number
  text: string
}

function lineStarts(text: string): number[] {
  const starts = [0]
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '\n') starts.push(index + 1)
  }
  return starts
}

export function locate(text: string, spans: readonly Span[]): Comment[] {
  const starts = lineStarts(text)
  const lineOf = (offset: number) => {
    let low = 0
    let high = starts.length - 1
    while (low < high) {
      const middle = (low + high + 1) >> 1
      if (starts[middle] <= offset) low = middle
      else high = middle - 1
    }
    return low
  }
  return [...spans]
    .sort((a, b) => a.start - b.start)
    .map(span => {
      const line = lineOf(span.start)
      return {
        line: line + 1,
        column: span.start - starts[line] + 1,
        text: excerpt(text.slice(span.start, span.end))
      }
    })
}

export function excerpt(comment: string): string {
  const firstLine = comment.split('\n', 1)[0].trim()
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine
}

export function lineEnd(text: string, from: number): number {
  const end = text.indexOf('\n', from)
  return end === -1 ? text.length : end
}
