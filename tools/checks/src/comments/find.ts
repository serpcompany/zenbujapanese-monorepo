import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { Language } from '../files'
import { classify, root } from '../files'
import type { Comment, Span } from '../text'
import { locate } from '../text'
import { jsonComments } from './json'
import { pythonComments } from './python'
import { shellComments } from './shell'
import {
  cssComments,
  dockerfileComments,
  hashLineComments,
  sqlComments,
  tomlComments,
  xmlComments
} from './simple'
import { isSwiftToolsVersion, swiftComments } from './swift'
import { typescriptComments } from './typescript'
import { yamlComments } from './yaml'

export interface FileComments {
  path: string
  comments: Comment[]
}

export interface Unclassified {
  path: string
}

type SpanFinder = (path: string, text: string) => Span[]

const finders: Record<Exclude<Language, 'python'>, SpanFinder> = {
  typescript: typescriptComments,
  json: (_, text) => jsonComments(text),
  swift: (path, text) => {
    const spans = swiftComments(text)
    return basename(path) === 'Package.swift'
      ? spans.filter(span => !isSwiftToolsVersion(text, span))
      : spans
  },
  shell: (_, text) => shellComments(text),
  yaml: yamlComments,
  toml: (_, text) => tomlComments(text),
  css: (_, text) => cssComments(text),
  sql: (_, text) => sqlComments(text),
  xml: (_, text) => xmlComments(text),
  'hash-lines': (_, text) => hashLineComments(text),
  dockerfile: (_, text) => dockerfileComments(text)
}

export function commentsIn(language: Exclude<Language, 'python'>, path: string, text: string) {
  return locate(text, finders[language](path, text))
}

export function findComments(paths: readonly string[]): {
  found: FileComments[]
  unclassified: Unclassified[]
} {
  const found: FileComments[] = []
  const unclassified: Unclassified[] = []
  const python: string[] = []
  for (const path of paths) {
    const kind = classify(path)
    if (kind.kind === 'unclassified') unclassified.push({ path })
    if (kind.kind !== 'code') continue
    if (kind.language === 'python') {
      python.push(path)
      continue
    }
    const text = readFileSync(join(root, path), 'utf8')
    const comments = commentsIn(kind.language, path, text)
    if (comments.length) found.push({ path, comments })
  }
  for (const [path, comments] of pythonComments(root, python)) {
    if (comments.length) found.push({ path, comments })
  }
  found.sort((a, b) => a.path.localeCompare(b.path))
  return { found, unclassified }
}
