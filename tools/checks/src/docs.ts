import { readFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import { anchorOf, headingAnchors } from './doc-rules/anchors'
import { hiddenComments } from './doc-rules/hidden'
import { agentsLineLimit, layoutAdvice, outOfLayout } from './doc-rules/layout'
import { missingScript, pnpmInvocations, workspaces } from './doc-rules/scripts'
import { skillCatalog, skillProblems } from './doc-rules/skills'
import { classify, repositoryFiles, root } from './files'

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

function codeSnippets(text: string): (Reference & { code: string })[] {
  const snippets: (Reference & { code: string })[] = []
  let inFence = false
  text.split('\n').forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      return
    }
    const found = inFence ? [line] : [...line.matchAll(/`([^`]+)`/g)].map(match => match[1])
    for (const code of found) snippets.push({ line: index + 1, target: code, code })
  })
  return snippets
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
      .map(match =>
        match[1]
          .replace(/^\.\//, '')
          .replace(/@refs\/.*$/, '')
          .replace(/:\d+(-\d+)?$/, '')
          .replace(/[/:.,]+$/, '')
      )
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

export function isOwnedDoc(path: string): boolean {
  const kind = classify(path).kind
  return path.endsWith('.md') && kind !== 'third-party' && kind !== 'written-by-a-tool'
}

interface Tree {
  files: ReadonlySet<string>
  folders: ReadonlySet<string>
}

let tree: Tree | undefined

function repositoryTree(): Tree {
  if (tree) return tree
  const files = new Set(repositoryFiles())
  const folders = new Set(['.'])
  for (const file of files) {
    for (let folder = posix.dirname(file); !folders.has(folder); folder = posix.dirname(folder)) {
      folders.add(folder)
    }
  }
  tree = { files, folders }
  return tree
}

const isFile = (path: string) => repositoryTree().files.has(path)
const isFolder = (path: string) => repositoryTree().folders.has(posix.normalize(path || '.'))
const exists = (path: string) => isFile(path) || isFolder(path)

export function referencedFiles(path: string, text: string): string[] {
  if (isDecisionRecord(path)) return []
  const linked = markdownLinks(text)
    .filter(({ target }) => !isExternal(target))
    .map(({ target }) => resolveLink(path, target))
  const named = codePaths(text).map(({ target }) =>
    exists(target) ? target : posix.join(posix.dirname(path), target)
  )
  return [...new Set([...linked, ...named])]
    .filter(target => !target.endsWith('.md') && isFile(target))
    .sort()
}

function markdownFilesIn(folder: string): string[] {
  const parent = posix.normalize(folder || '.')
  return [...repositoryTree().files].filter(
    path => path.endsWith('.md') && posix.dirname(path) === parent
  )
}

export function checkDocs(files: readonly string[]): DocProblem[] {
  const requested = new Set(files)
  const owned = [...repositoryTree().files].filter(isOwnedDoc)
  const problems: DocProblem[] = []
  const linkedFrom = new Map<string, string[]>()
  const texts = new Map(owned.map(path => [path, readFileSync(join(root, path), 'utf8')]))
  const anchors = new Map<string, Set<string>>()
  const anchorsOf = (path: string) => {
    if (!anchors.has(path)) {
      const text = texts.get(path) ?? readFileSync(join(root, path), 'utf8')
      anchors.set(path, headingAnchors(blankFencedCode(text)))
    }
    return anchors.get(path) as Set<string>
  }
  const known = workspaces()
  let links = 0

  for (const path of owned) {
    const text = texts.get(path) as string
    const linked: string[] = []
    for (const { line, target } of markdownLinks(text)) {
      links++
      const anchor = anchorOf(target)
      if (target.startsWith('#')) {
        if (anchor && !anchorsOf(path).has(anchor)) {
          problems.push({
            path,
            line,
            problem: `links to ${target}, a heading this doc doesn't have`
          })
        }
        continue
      }
      if (isExternal(target)) continue
      const resolved = resolveLink(path, target)
      if (!exists(resolved)) {
        problems.push({ path, line, problem: `links to ${target}, which doesn't exist` })
        continue
      }
      if (
        anchor &&
        resolved.endsWith('.md') &&
        isFile(resolved) &&
        !anchorsOf(resolved).has(anchor)
      ) {
        problems.push({
          path,
          line,
          problem: `links to ${target}, a heading ${resolved} doesn't have`
        })
      }
      linked.push(...(isFolder(resolved) ? markdownFilesIn(resolved) : [resolved]))
    }
    linkedFrom.set(path, linked)
    if (isDecisionRecord(path)) continue
    for (const { line, target } of codePaths(text)) {
      const fromHere = posix.join(posix.dirname(path), target)
      if (!exists(target) && !exists(fromHere)) {
        problems.push({ path, line, problem: `names ${target}, which doesn't exist` })
      }
    }
    for (const { line, code } of codeSnippets(text)) {
      for (const invocation of pnpmInvocations(code)) {
        if (missingScript(invocation, known)) {
          problems.push({
            path,
            line,
            problem: `runs pnpm ${invocation.script}, which no package.json defines`
          })
        }
      }
    }
    for (const { line, text: comment } of hiddenComments(blankFencedCode(text))) {
      problems.push({
        path,
        line,
        problem: `hides ${comment} from people reading the rendered doc, though agents read it: say it in the doc, or delete it`
      })
    }
    if (outOfLayout(path)) problems.push({ path, problem: layoutAdvice })
  }

  for (const path of owned) {
    for (const problem of skillProblems(
      path,
      texts.get(path) as string,
      linkedFrom.get(skillCatalog) ?? []
    )) {
      problems.push({ path, problem })
    }
  }
  const agentsLines = (texts.get('AGENTS.md') ?? '').trimEnd().split('\n').length
  if (agentsLines > agentsLineLimit) {
    problems.push({
      path: 'AGENTS.md',
      problem: `is ${agentsLines} lines; it only routes, so keep it to ${agentsLineLimit} by moving detail into the doc it routes to`
    })
  }
  if (!owned.length || !links) {
    problems.push({
      path: 'AGENTS.md',
      problem: `the docs check found ${owned.length} docs and ${links} links, so it checked nothing: see isOwnedDoc in tools/checks/src/docs.ts`
    })
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
  return problems.filter(problem => requested.has(problem.path))
}
