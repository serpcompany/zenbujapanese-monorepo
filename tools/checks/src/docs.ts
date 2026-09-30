import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, posix } from 'node:path'
import { classify, root } from './files'

export interface Reference {
  line: number
  target: string
}

export interface DocProblem {
  path: string
  line?: number
  problem: string
}

const repositoryPath =
  /^(apps|packages|tools|docs|language-data|assets|\.github|\.claude)\/[\w.@[\]()/-]*$/

function blankFencedCode(text: string): string {
  let inFence = false
  return text
    .split('\n')
    .map(line => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence
        return ''
      }
      return inFence ? '' : line
    })
    .join('\n')
}

function eachLine<T>(text: string, find: (line: string) => Iterable<T>): (T & { line: number })[] {
  return blankFencedCode(text)
    .split('\n')
    .flatMap((line, index) => [...find(line)].map(found => ({ ...found, line: index + 1 })))
}

export function markdownLinks(text: string): Reference[] {
  return eachLine(text, line => {
    const withoutCode = line.replace(/`[^`]*`/g, '')
    const inline = [...withoutCode.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)]
    const reference = [...withoutCode.matchAll(/^\s*\[[^\]]+\]:\s*<?(\S+?)>?(?:\s|$)/g)]
    return [...inline, ...reference].map(match => ({ target: match[1] }))
  })
}

export function codePaths(text: string): Reference[] {
  return eachLine(text, line =>
    [...line.matchAll(/`([^`\s]+)`/g)]
      .map(match => match[1].replace(/^\.\//, '').replace(/[/:.,]+$/, ''))
      .filter(path => repositoryPath.test(path))
      .map(target => ({ target }))
  )
}

function isExternal(target: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('#')
}

function resolveLink(from: string, target: string): string {
  const path = decodeURIComponent(target.replace(/[#?].*$/, ''))
  const resolved = path.startsWith('/')
    ? posix.normalize(path.slice(1))
    : posix.normalize(posix.join(posix.dirname(from), path))
  return resolved.replace(/\/$/, '')
}

function isDecisionRecord(path: string): boolean {
  return path.startsWith('docs/adr/')
}

function isEntryPoint(path: string): boolean {
  const name = posix.basename(path)
  return (
    path === 'README.md' ||
    name === 'AGENTS.md' ||
    name === 'CLAUDE.md' ||
    path.startsWith('.claude/') ||
    path.startsWith('.github/')
  )
}

function markdownFilesIn(folder: string): string[] {
  const absolute = join(root, folder)
  if (!existsSync(absolute) || !statSync(absolute).isDirectory()) return []
  return readdirSync(absolute)
    .filter(name => name.endsWith('.md'))
    .map(name => (folder ? `${folder}/${name}` : name))
}

export function checkDocs(files: readonly string[]): DocProblem[] {
  const docs = files.filter(path => path.endsWith('.md'))
  const owned = docs.filter(path => {
    const kind = classify(path).kind
    return kind !== 'third-party' && kind !== 'written-by-a-tool'
  })
  const problems: DocProblem[] = []
  const linkedFrom = new Map<string, string[]>()

  for (const path of owned) {
    const text = readFileSync(join(root, path), 'utf8')
    const linked: string[] = []
    for (const { line, target } of markdownLinks(text)) {
      if (isExternal(target)) continue
      const resolved = resolveLink(path, target)
      if (!existsSync(join(root, resolved))) {
        problems.push({ path, line, problem: `links to ${target}, which doesn't exist` })
        continue
      }
      linked.push(
        ...(statSync(join(root, resolved)).isDirectory() ? markdownFilesIn(resolved) : [resolved])
      )
    }
    for (const { line, target } of isDecisionRecord(path) ? [] : codePaths(text)) {
      const fromHere = posix.join(posix.dirname(path), target)
      if (!existsSync(join(root, target)) && !existsSync(join(root, fromHere))) {
        problems.push({ path, line, problem: `names ${target}, which doesn't exist` })
      }
    }
    linkedFrom.set(path, linked)
  }

  const reached = new Set(owned.filter(isEntryPoint))
  const queue = [...reached]
  while (queue.length) {
    for (const next of linkedFrom.get(queue.shift() as string) ?? []) {
      if (!reached.has(next)) {
        reached.add(next)
        queue.push(next)
      }
    }
  }
  for (const path of owned) {
    if (!reached.has(path)) {
      problems.push({ path, problem: "isn't linked from AGENTS.md, or from any doc it leads to" })
    }
  }
  return problems
}
