import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { repositoryFiles, root } from '../files'

const builtins = new Set([
  'add',
  'approve-builds',
  'audit',
  'bin',
  'config',
  'create',
  'deploy',
  'dlx',
  'exec',
  'fetch',
  'help',
  'i',
  'import',
  'init',
  'install',
  'licenses',
  'link',
  'list',
  'ls',
  'outdated',
  'pack',
  'patch',
  'prune',
  'publish',
  'rebuild',
  'remove',
  'rm',
  'root',
  'self-update',
  'store',
  'unlink',
  'up',
  'update',
  'why'
])

const optionsWithValues = new Set(['--filter', '-F', '--dir', '-C', '--reporter', '--loglevel'])

export interface Workspace {
  name: string
  folder: string
  scripts: ReadonlySet<string>
}

function workspacePatterns(): string[] {
  const parsed: unknown = parse(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8'))
  const packages = (parsed as { packages?: unknown } | null)?.packages
  if (!Array.isArray(packages) || !packages.every(pattern => typeof pattern === 'string')) {
    throw new Error('pnpm-workspace.yaml has no list of package patterns')
  }
  return packages
}

function manifestOf(path: string): { name?: string; scripts: string[] } {
  const parsed: unknown = JSON.parse(readFileSync(join(root, path), 'utf8'))
  const { name, scripts } = (parsed ?? {}) as { name?: unknown; scripts?: unknown }
  if (scripts !== undefined && (typeof scripts !== 'object' || scripts === null)) {
    throw new Error(`${path}'s scripts aren't an object`)
  }
  return {
    ...(typeof name === 'string' ? { name } : {}),
    scripts: Object.keys(scripts ?? {})
  }
}

const escapeRegExp = (text: string) => text.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&')

export function workspaceManifest(pattern: string): RegExp {
  const folders = pattern
    .split('/')
    .map(part => (part === '**' ? '.+' : part.split('*').map(escapeRegExp).join('[^/]+')))
    .join('/')
  return new RegExp(`^${folders}/package\\.json$`)
}

export function workspaces(): Workspace[] {
  const patterns = workspacePatterns().map(workspaceManifest)
  const manifests = repositoryFiles().filter(
    path => path === 'package.json' || patterns.some(pattern => pattern.test(path))
  )
  return manifests.map(path => {
    const manifest = manifestOf(path)
    return {
      name: manifest.name ?? path,
      folder: path === 'package.json' ? '.' : path.replace(/\/package\.json$/, ''),
      scripts: new Set(manifest.scripts)
    }
  })
}

interface Invocation {
  script: string
  filters: string[]
}

export function pnpmInvocations(code: string): Invocation[] {
  const invocations: Invocation[] = []
  for (const match of code.matchAll(/(?:^|[\s;&|(])pnpm((?:\s+[^\s;&|)]+)+)/g)) {
    const words = match[1].trim().split(/\s+/)
    const filters: string[] = []
    let index = 0
    while (index < words.length && words[index].startsWith('-')) {
      const [option, inline] = words[index].split('=')
      if (optionsWithValues.has(option)) {
        const value = inline ?? words[++index]
        if ((option === '--filter' || option === '-F') && value) filters.push(value)
        if ((option === '--dir' || option === '-C') && value) filters.push(`./${value}`)
      }
      index++
    }
    let command = words[index]
    if (command === 'run') command = words[index + 1]
    if (!command || builtins.has(command) || !/^[a-z][\w:.-]*$/i.test(command)) continue
    invocations.push({ script: command, filters })
  }
  return invocations
}

export function missingScript(invocation: Invocation, known: readonly Workspace[]): boolean {
  const scoped = known.filter(workspace =>
    invocation.filters.some(
      filter => filter === workspace.name || filter.replace(/^\.\//, '') === workspace.folder
    )
  )
  const candidates = scoped.length ? scoped : known
  return !candidates.some(workspace => workspace.scripts.has(invocation.script))
}
