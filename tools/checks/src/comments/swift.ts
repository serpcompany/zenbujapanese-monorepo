import type { Span } from '../text'
import { lineEnd } from '../text'

export function swiftComments(text: string): Span[] {
  const spans: Span[] = []

  const blockCommentEnd = (start: number) => {
    let depth = 0
    let index = start
    while (index < text.length) {
      if (text.startsWith('/*', index)) {
        depth++
        index += 2
      } else if (text.startsWith('*/', index)) {
        depth--
        index += 2
        if (depth === 0) return index
      } else {
        index++
      }
    }
    return text.length
  }

  const stringEnd = (openingQuote: number, hashes: string): number => {
    const multiline = text.startsWith('"""', openingQuote)
    const quotes = multiline ? '"""' : '"'
    const closing = quotes + hashes
    const escapeSequence = `\\${hashes}`
    let index = openingQuote + quotes.length
    while (index < text.length) {
      if (text.startsWith(closing, index)) return index + closing.length
      if (text.startsWith(escapeSequence, index)) {
        const afterEscape = index + escapeSequence.length
        index = text[afterEscape] === '(' ? codeEnd(afterEscape + 1, true) : afterEscape + 1
        continue
      }
      if (!multiline && text[index] === '\n') return index
      index++
    }
    return text.length
  }

  const extendedRegexEnd = (openingSlash: number, hashes: string) => {
    const closing = `/${hashes}`
    const close = text.indexOf(closing, openingSlash + 1)
    return close === -1 ? text.length : close + closing.length
  }

  const literalEnd = (start: number): number | null => {
    let index = start
    while (text[index] === '#') index++
    const hashes = text.slice(start, index)
    if (text[index] === '"') return stringEnd(index, hashes)
    if (hashes && text[index] === '/') return extendedRegexEnd(index, hashes)
    return null
  }

  function codeEnd(start: number, inInterpolation: boolean): number {
    let index = start
    let depth = 0
    while (index < text.length) {
      const character = text[index]
      if (text.startsWith('//', index)) {
        const end = lineEnd(text, index)
        spans.push({ start: index, end })
        index = end
        continue
      }
      if (text.startsWith('/*', index)) {
        const end = blockCommentEnd(index)
        spans.push({ start: index, end })
        index = end
        continue
      }
      if (character === '"' || character === '#') {
        const end = literalEnd(index)
        if (end !== null) {
          index = end
          continue
        }
      }
      if (inInterpolation && character === '(') depth++
      if (inInterpolation && character === ')') {
        if (depth === 0) return index + 1
        depth--
      }
      index++
    }
    return index
  }

  codeEnd(0, false)
  return spans
}

export function isSwiftToolsVersion(text: string, span: Span): boolean {
  return span.start === 0 && text.startsWith('// swift-tools-version:')
}
