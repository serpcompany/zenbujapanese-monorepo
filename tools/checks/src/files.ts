import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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

export type Language =
  | 'typescript'
  | 'json'
  | 'swift'
  | 'python'
  | 'shell'
  | 'yaml'
  | 'toml'
  | 'css'
  | 'sql'
  | 'xml'
  | 'hash-lines'
  | 'dockerfile'

export type FileKind =
  | { kind: 'code'; language: Language }
  | { kind: 'prose-or-data' }
  | { kind: 'written-by-a-tool'; tool: string }
  | { kind: 'third-party'; source: string }
  | { kind: 'pinned-bytes'; pinnedBy: string }
  | { kind: 'unclassified' }

const writtenByTools: readonly [RegExp, string][] = [
  [/^apps\/web\/cloudflare-env\.d\.ts$/, 'wrangler types (pnpm cf-typegen in apps/web)'],
  [/^pnpm-lock\.yaml$/, 'pnpm install'],
  [/\.(pbxproj|xcscheme|xcworkspacedata)$/, 'Xcode'],
  [/(^|\/)Package\.resolved$/, 'Swift Package Manager']
]

const thirdParty: readonly [RegExp, string][] = [
  [/^apps\/ios\/Modules\/Sources\/SearchExperience\/Resources\/Kuromoji\//, 'Kuromoji'],
  [/^apps\/ios\/Modules\/Sources\/SearchExperience\/Resources\/SudachiRuntime\//, 'Sudachi'],
  [/^language-data\/notices\//, 'the language data sources'],
  [
    /^apps\/ios\/LanguageData\/Sources\/Kanji-JLPT-Waller-[^/]+\/[^/]+\.html$/,
    "Jonathan Waller's tanos.co.uk pages, as the Wayback Machine captured them"
  ]
]

const pinnedBytes: readonly [RegExp, string][] = [
  [
    /^apps\/ios\/Modules\/Sources\/SearchExperience\/Resources\/FrequencyPackMappingV\d+\.sql$/,
    "every published frequency pack's mappingPolicySHA256"
  ]
]

const languagesByExtension: Record<string, Language> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.js': 'typescript',
  '.jsx': 'typescript',
  '.mjs': 'typescript',
  '.cjs': 'typescript',
  '.json': 'json',
  '.jsonc': 'json',
  '.webmanifest': 'json',
  '.swift': 'swift',
  '.py': 'python',
  '.sh': 'shell',
  '.bash': 'shell',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.toml': 'toml',
  '.css': 'css',
  '.sql': 'sql',
  '.xml': 'xml',
  '.svg': 'xml',
  '.plist': 'xml',
  '.xcprivacy': 'xml',
  '.entitlements': 'xml',
  '.storyboard': 'xml',
  '.xib': 'xml',
  '.html': 'xml'
}

const languagesByName: Record<string, Language> = {
  Dockerfile: 'dockerfile',
  '.gitignore': 'hash-lines',
  '.gitattributes': 'hash-lines',
  '.npmrc': 'hash-lines',
  '.editorconfig': 'hash-lines',
  '.shellcheckrc': 'hash-lines'
}

const proseAndData = new Set([
  '.md',
  '.txt',
  '.csv',
  '.tsv',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.icns',
  '.avif',
  '.webp',
  '.pdf',
  '.woff',
  '.woff2',
  '.gz',
  '.xz',
  '.bz2',
  '.zip',
  '.sqlite3',
  '.mlmodel',
  '.bin',
  '.wav',
  '.dic',
  '.gitkeep'
])

function shebangLanguage(path: string): Language | undefined {
  const firstLine = readFileSync(join(root, path), 'utf8').split('\n', 1)[0]
  if (/^#!.*\b(ba|z)?sh\b/.test(firstLine)) return 'shell'
  if (/^#!.*\bpython/.test(firstLine)) return 'python'
  if (/^#!.*\bnode\b/.test(firstLine)) return 'typescript'
  return undefined
}

export function classify(path: string): FileKind {
  for (const [pattern, tool] of writtenByTools) {
    if (pattern.test(path)) return { kind: 'written-by-a-tool', tool }
  }
  for (const [pattern, source] of thirdParty) {
    if (pattern.test(path)) return { kind: 'third-party', source }
  }
  for (const [pattern, pinnedBy] of pinnedBytes) {
    if (pattern.test(path)) return { kind: 'pinned-bytes', pinnedBy }
  }
  const name = basename(path)
  const extension = extname(name).toLowerCase()
  const language =
    languagesByName[name] ??
    (name.startsWith('.env') || name.endsWith('.dockerignore') ? 'hash-lines' : undefined) ??
    (/^requirements.*\.txt$/.test(name) ? 'hash-lines' : undefined) ??
    languagesByExtension[extension]
  if (language) return { kind: 'code', language }
  if (proseAndData.has(extension) || proseAndData.has(name)) return { kind: 'prose-or-data' }
  if (!extension) {
    const fromShebang = shebangLanguage(path)
    if (fromShebang) return { kind: 'code', language: fromShebang }
  }
  return { kind: 'unclassified' }
}
