import type { Span } from '../text'
import { lineEnd } from '../text'

const wordBreaks = new Set([' ', '\t', '\n', '\r', ';', '&', '|', '(', ')'])

export function shellComments(text: string): Span[] {
  const spans: Span[] = []
  const pending: string[] = []

  const singleQuotedEnd = (start: number) => {
    const close = text.indexOf("'", start + 1)
    return close === -1 ? text.length : close + 1
  }

  const ansiQuotedEnd = (start: number) => {
    let index = start + 2
    while (index < text.length && text[index] !== "'") index += text[index] === '\\' ? 2 : 1
    return index + 1
  }

  const bracedEnd = (start: number) => {
    let depth = 0
    let index = start
    while (index < text.length) {
      const character = text[index]
      if (character === '\\') index += 2
      else if (character === "'") index = singleQuotedEnd(index)
      else if (character === '"') index = doubleQuotedEnd(index)
      else {
        if (character === '{') depth++
        if (character === '}') {
          depth--
          if (depth === 0) return index + 1
        }
        index++
      }
    }
    return index
  }

  const arithmeticEnd = (start: number) => {
    const close = text.indexOf('))', start + 3)
    return close === -1 ? text.length : close + 2
  }

  const backtickEnd = (start: number) => {
    let index = start + 1
    while (index < text.length && text[index] !== '`') index += text[index] === '\\' ? 2 : 1
    return index + 1
  }

  function doubleQuotedEnd(start: number): number {
    let index = start + 1
    while (index < text.length) {
      const character = text[index]
      if (character === '\\') index += 2
      else if (character === '"') return index + 1
      else if (text.startsWith('$((', index)) index = arithmeticEnd(index)
      else if (text.startsWith('$(', index)) index = codeEnd(index + 2, true)
      else if (text.startsWith('${', index)) index = bracedEnd(index + 1)
      else if (character === '`') index = backtickEnd(index)
      else index++
    }
    return index
  }

  const heredocStart = (start: number) => {
    let index = start + 2
    if (text[index] === '-') index++
    while (text[index] === ' ' || text[index] === '\t') index++
    const quote = text[index] === "'" || text[index] === '"' ? text[index] : ''
    if (quote) index++
    if (text[index] === '\\') index++
    const wordStart = index
    while (index < text.length && /[\w.-]/.test(text[index])) index++
    const delimiter = text.slice(wordStart, index)
    if (quote && text[index] === quote) index++
    if (delimiter) pending.push(delimiter)
    return index
  }

  const heredocBodiesEnd = (newline: number) => {
    let index = newline + 1
    for (const delimiter of pending.splice(0)) {
      while (index < text.length) {
        const end = lineEnd(text, index)
        const line = text.slice(index, end).replace(/\r$/, '')
        index = end + 1
        if (line.trimStart() === delimiter) break
      }
    }
    return index
  }

  function codeEnd(start: number, inSubstitution: boolean): number {
    let index = start
    let depth = 0
    while (index < text.length) {
      const character = text[index]
      const atWordStart = index === 0 || wordBreaks.has(text[index - 1])
      if (character === '#' && atWordStart && !(index === 0 && text[1] === '!')) {
        const end = lineEnd(text, index)
        spans.push({ start: index, end })
        index = end
      } else if (character === '\n') {
        index = pending.length ? heredocBodiesEnd(index) : index + 1
      } else if (character === '\\') {
        index += 2
      } else if (character === "'") {
        index = singleQuotedEnd(index)
      } else if (text.startsWith("$'", index)) {
        index = ansiQuotedEnd(index)
      } else if (character === '"') {
        index = doubleQuotedEnd(index)
      } else if (character === '`') {
        index = backtickEnd(index)
      } else if (text.startsWith('$((', index)) {
        index = arithmeticEnd(index)
      } else if (text.startsWith('$(', index)) {
        index = codeEnd(index + 2, true)
      } else if (text.startsWith('${', index)) {
        index = bracedEnd(index + 1)
      } else if (text.startsWith('<<<', index)) {
        index += 3
      } else if (text.startsWith('<<', index)) {
        index = heredocStart(index)
      } else if (text.startsWith('#!', index) && index === 0) {
        index = lineEnd(text, index)
      } else {
        if (inSubstitution && character === '(') depth++
        if (inSubstitution && character === ')') {
          if (depth === 0) return index + 1
          depth--
        }
        index++
      }
    }
    return index
  }

  codeEnd(0, false)
  return spans
}
