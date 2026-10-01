import { isMap, isScalar, Parser, parseDocument, Scalar, visit } from 'yaml'
import type { Span } from '../text'
import { lineEnd } from '../text'
import { shellComments } from './shell'
import { typescriptComments } from './typescript'

function yamlOnlyComments(text: string): Span[] {
  const spans: Span[] = []
  const walk = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item)
      return
    }
    if (!value || typeof value !== 'object') return
    const token = value as { type?: string; offset?: number; source?: string }
    if (token.type === 'comment' && typeof token.offset === 'number') {
      spans.push({ start: token.offset, end: token.offset + (token.source?.length ?? 0) })
      return
    }
    for (const child of Object.values(value)) walk(child)
  }
  for (const token of new Parser().parse(text)) walk(token)
  return spans
}

function runBlockComments(text: string): Span[] {
  const spans: Span[] = []
  const document = parseDocument(text)
  visit(document, {
    Pair(_, pair, path) {
      if (!isScalar(pair.key) || pair.key.value !== 'run') return
      const value = pair.value
      if (!isScalar(value) || !value.range) return
      if (value.type !== Scalar.BLOCK_LITERAL && value.type !== Scalar.BLOCK_FOLDED) return
      const step = path.at(-1)
      const shell = isMap(step) ? String(step.get('shell') ?? '') : ''
      const bodyStart = lineEnd(text, value.range[0]) + 1
      const body = text.slice(bodyStart, value.range[1])
      const comments =
        shell.split(' ')[0] === 'node' ? typescriptComments('run.js', body) : shellComments(body)
      for (const span of comments) {
        spans.push({ start: bodyStart + span.start, end: bodyStart + span.end })
      }
    }
  })
  return spans
}

export function yamlComments(path: string, text: string): Span[] {
  const runsShell = path.startsWith('.github/')
  return [...yamlOnlyComments(text), ...(runsShell ? runBlockComments(text) : [])]
}
