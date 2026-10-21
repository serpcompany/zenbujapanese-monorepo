import { posix } from 'node:path'

interface Reference {
  line: number
  target: string
}

interface Tree {
  files: ReadonlySet<string>
  folders: ReadonlySet<string>
}

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

function eachLine(text: string, find: (line: string) => string[]): Reference[] {
  return blankFencedCode(text)
    .split('\n')
    .flatMap((line, index) => find(line).map(target => ({ target, line: index + 1 })))
}

export function markdownLinks(text: string): Reference[] {
  return eachLine(text, line => {
    const withoutCode = line.replace(/`[^`]*`/g, '')
    const inline = [...withoutCode.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)]
    const reference = [...withoutCode.matchAll(/^\s*\[[^\]]+\]:\s*<?(\S+?)>?(?:\s|$)/g)]
    return [...inline, ...reference].map(match => match[1])
  })
}

export function codePaths(text: string, roots: readonly string[]): Reference[] {
  const repositoryPath = new RegExp(
    `^(?:${roots.map(each => each.replace(/[.\\]/g, '\\$&')).join('|')})/[\\w.@[\\]()/-]*$`
  )
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
  )
}

const isExternal = (target: string) => /^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('#')

function resolveLink(from: string, target: string): string {
  const path = decodeURIComponent(target.replace(/[#?].*$/, ''))
  const resolved = path.startsWith('/')
    ? posix.normalize(path.slice(1))
    : posix.normalize(posix.join(posix.dirname(from), path))
  return resolved.replace(/\/$/, '')
}

export function treeOf(files: readonly string[]): Tree {
  const folders = new Set(['.'])
  for (const file of files) {
    for (let folder = posix.dirname(file); !folders.has(folder); folder = posix.dirname(folder)) {
      folders.add(folder)
    }
  }
  return { files: new Set(files), folders }
}

export function referencedFiles(
  path: string,
  text: string,
  tree: Tree,
  roots: readonly string[]
): string[] {
  if (path.startsWith('docs/adr/')) return []
  const exists = (target: string) => tree.files.has(target) || tree.folders.has(target)
  const linked = markdownLinks(text)
    .filter(({ target }) => !isExternal(target))
    .map(({ target }) => resolveLink(path, target))
  const named = codePaths(text, roots).map(({ target }) =>
    exists(target) ? target : posix.join(posix.dirname(path), target)
  )
  return [...new Set([...linked, ...named])]
    .filter(target => !target.endsWith('.md') && tree.files.has(target))
    .sort()
}
