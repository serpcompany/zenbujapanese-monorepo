import type { Span } from '../text'
import { lineEnd } from '../text'
import { shellComments } from './shell'

interface Syntax {
  quotes: readonly string[]
  backslashEscapes: boolean
  lineComment?: string
  blockComment?: readonly [string, string]
}

function scan(text: string, syntax: Syntax): Span[] {
  const spans: Span[] = []
  let index = 0
  while (index < text.length) {
    const quote = syntax.quotes.find(candidate => text.startsWith(candidate, index))
    if (quote) {
      index += quote.length
      while (index < text.length && !text.startsWith(quote, index)) {
        index += syntax.backslashEscapes && text[index] === '\\' ? 2 : 1
      }
      index += quote.length
    } else if (syntax.lineComment && text.startsWith(syntax.lineComment, index)) {
      const end = lineEnd(text, index)
      spans.push({ start: index, end })
      index = end
    } else if (syntax.blockComment && text.startsWith(syntax.blockComment[0], index)) {
      const close = text.indexOf(syntax.blockComment[1], index + syntax.blockComment[0].length)
      const end = close === -1 ? text.length : close + syntax.blockComment[1].length
      spans.push({ start: index, end })
      index = end
    } else {
      index++
    }
  }
  return spans
}

export function tomlComments(text: string): Span[] {
  return scan(text, {
    quotes: ['"""', "'''", '"', "'"],
    backslashEscapes: true,
    lineComment: '#'
  })
}

export function cssComments(text: string): Span[] {
  return scan(text, { quotes: ['"', "'"], backslashEscapes: true, blockComment: ['/*', '*/'] })
}

export function sqlComments(text: string): Span[] {
  return scan(text, {
    quotes: ["'", '"'],
    backslashEscapes: false,
    lineComment: '--',
    blockComment: ['/*', '*/']
  })
}

export function xmlComments(text: string): Span[] {
  const spans: Span[] = []
  for (const match of text.matchAll(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?(?:-->|$)/g)) {
    if (match[0].startsWith('<!--')) {
      spans.push({ start: match.index, end: match.index + match[0].length })
    }
  }
  return spans
}

export function hashLineComments(text: string): Span[] {
  const spans: Span[] = []
  let start = 0
  while (start < text.length) {
    const end = lineEnd(text, start)
    const indent = text.slice(start, end).search(/\S/)
    if (indent !== -1 && text[start + indent] === '#') spans.push({ start: start + indent, end })
    start = end + 1
  }
  return spans
}

export function dockerfileComments(text: string): Span[] {
  return shellComments(text)
}
