import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { matchesGlob } from './glob'

export const root = fileURLToPath(new URL('../../../', import.meta.url)).replace(/[\\/]$/, '')

export function repositoryFiles(): string[] {
  const listed = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  )
  const paths = new Set(listed.split('\0').filter(Boolean))
  return [...paths].filter(path => existsSync(join(root, path))).sort()
}

interface Allowance {
  lines?: number
  blocks?: number
  reason: string
}

export interface VerifyConfig {
  files?: Partial<Record<'generated' | 'thirdParty' | 'pinned', Record<string, string>>>
  docs?: { pathRoots?: string[] }
  exceptions?: Partial<
    Record<'knownLargeFiles' | 'knownLongDocs' | 'knownDuplicates', Record<string, Allowance>>
  >
}

export const readVerifyConfig = (folder = root): VerifyConfig =>
  JSON.parse(readFileSync(join(folder, 'verify.json'), 'utf8'))

const notWrittenHere = ['generated', 'thirdParty', 'pinned'] as const

export const isWrittenHere = (path: string, config: VerifyConfig) =>
  !notWrittenHere.some(kind =>
    Object.keys(config.files?.[kind] ?? {}).some(pattern => matchesGlob(pattern, path))
  )

const measuredExtensions = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.swift',
  '.py',
  '.sh',
  '.bash'
])

const measuredShebang = /^#!.*\b(?:(?:ba|z)?sh|python\S*|node)\b/

export function isMeasuredCode(path: string, config: VerifyConfig, folder = root): boolean {
  if (!isWrittenHere(path, config)) return false
  const extension = extname(basename(path)).toLowerCase()
  if (extension) return measuredExtensions.has(extension)
  return measuredShebang.test(readFileSync(join(folder, path), 'utf8').split('\n', 1)[0] ?? '')
}
