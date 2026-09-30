import type { Span } from '../text'
import { lineEnd } from '../text'

export function jsonComments(text: string): Span[] {
  const spans: Span[] = []
  let index = 0
  while (index < text.length) {
    const character = text[index]
    if (character === '"') {
      index++
      while (index < text.length && text[index] !== '"') {
        index += text[index] === '\\' ? 2 : 1
      }
      index++
    } else if (character === '/' && text[index + 1] === '/') {
      const end = lineEnd(text, index)
      spans.push({ start: index, end })
      index = end
    } else if (character === '/' && text[index + 1] === '*') {
      const close = text.indexOf('*/', index + 2)
      const end = close === -1 ? text.length : close + 2
      spans.push({ start: index, end })
      index = end
    } else {
      index++
    }
  }
  return spans
}
