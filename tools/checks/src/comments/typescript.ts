import ts from 'typescript'
import type { Span } from '../text'

const scriptKinds: Record<string, ts.ScriptKind> = {
  '.ts': ts.ScriptKind.TS,
  '.mts': ts.ScriptKind.TS,
  '.cts': ts.ScriptKind.TS,
  '.tsx': ts.ScriptKind.TSX,
  '.js': ts.ScriptKind.JS,
  '.mjs': ts.ScriptKind.JS,
  '.cjs': ts.ScriptKind.JS,
  '.jsx': ts.ScriptKind.JSX
}

function scriptKind(path: string): ts.ScriptKind {
  const extension = path.slice(path.lastIndexOf('.'))
  return scriptKinds[extension] ?? ts.ScriptKind.TS
}

function isJSDocNode(node: ts.Node): boolean {
  return node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode
}

export function typescriptComments(path: string, text: string): Span[] {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, scriptKind(path))
  const jsxText: Span[] = []
  const found = new Map<number, Span>()

  const collect = (ranges: readonly ts.CommentRange[] | undefined) => {
    for (const range of ranges ?? []) {
      found.set(range.pos, { start: range.pos, end: range.end })
    }
  }

  const visit = (node: ts.Node) => {
    if (isJSDocNode(node)) return
    if (node.kind === ts.SyntaxKind.JsxText) {
      jsxText.push({ start: node.pos, end: node.end })
      return
    }
    collect(ts.getLeadingCommentRanges(text, node.pos))
    collect(ts.getTrailingCommentRanges(text, node.end))
    for (const child of node.getChildren(source)) visit(child)
  }
  visit(source)

  const insideJsxText = (span: Span) =>
    jsxText.some(text => span.start >= text.start && span.start < text.end)
  return [...found.values()].filter(span => !insideJsxText(span))
}
