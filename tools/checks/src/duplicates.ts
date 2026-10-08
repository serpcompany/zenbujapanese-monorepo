import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, extname, join } from 'node:path'
import { classify, extensionsOf, type Language, root } from './files'

const minimumTokens = 50
const minimumLines = 5

const jscpdFormatsByLanguage = new Map<Language, string>([
  ['typescript', 'typescript'],
  ['swift', 'swift'],
  ['python', 'python'],
  ['shell', 'bash']
])
const jscpdFormats = [...jscpdFormatsByLanguage.values()].join(',')
const jscpdExtensions = [...jscpdFormatsByLanguage]
  .map(([language, format]) => `${format}:${extensionsOf(language).join(',')}`)
  .join(';')

interface Location {
  name: string
  start: number
  end: number
}

interface Clone {
  format: string
  lines: number
  firstFile: Location
  secondFile: Location
}

export interface Duplicate {
  first: Location
  second: Location
  lines: number
}

function scannedFiles(files: readonly string[]): string[] {
  return files.filter(path => {
    const kind = classify(path)
    return (
      kind.kind === 'code' &&
      jscpdFormatsByLanguage.has(kind.language) &&
      extensionsOf(kind.language).includes(extname(path).slice(1).toLowerCase())
    )
  })
}

const require = createRequire(import.meta.url)

function jscpdBin(): string {
  return join(dirname(require.resolve('jscpd')), '..', '..', 'bin', 'jscpd')
}

const isLocation = (value: unknown): value is Location => {
  const location = value as Partial<Location> | null
  return (
    typeof location?.name === 'string' &&
    typeof location.start === 'number' &&
    typeof location.end === 'number'
  )
}

const isClone = (value: unknown): value is Clone => {
  const clone = value as Partial<Clone> | null
  return (
    typeof clone?.lines === 'number' && isLocation(clone.firstFile) && isLocation(clone.secondFile)
  )
}

function readClones(report: string): Duplicate[] {
  const parsed: unknown = JSON.parse(report)
  const duplicates = (parsed as { duplicates?: unknown } | null)?.duplicates
  if (!Array.isArray(duplicates) || !duplicates.every(isClone)) {
    throw new Error(
      "jscpd's JSON report doesn't have the shape this check reads: see duplicates.ts"
    )
  }
  return duplicates
    .map(clone => ({ first: clone.firstFile, second: clone.secondFile, lines: clone.lines }))
    .sort(
      (left, right) =>
        left.first.name.localeCompare(right.first.name) || left.first.start - right.first.start
    )
}

export function findDuplicates(files: readonly string[]): Duplicate[] {
  const scanned = scannedFiles(files)
  if (!scanned.length) return []
  const output = mkdtempSync(join(tmpdir(), 'zenbu-duplicates-'))
  try {
    const run = spawnSync(
      process.execPath,
      [
        jscpdBin(),
        '--min-tokens',
        String(minimumTokens),
        '--min-lines',
        String(minimumLines),
        '--format',
        jscpdFormats,
        '--formats-exts',
        jscpdExtensions,
        '--reporters',
        'json',
        '--output',
        output,
        '--silent',
        ...scanned
      ],
      { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    )
    if (run.status !== 0) {
      throw new Error(`jscpd failed: ${`${run.stdout}${run.stderr}`.trim()}`)
    }
    const report = join(output, 'jscpd-report.json')
    if (!existsSync(report)) {
      throw new Error(
        `jscpd read none of the ${scanned.length} files it was given, so its formats no longer match files.ts: see duplicates.ts`
      )
    }
    return readClones(readFileSync(report, 'utf8'))
  } finally {
    rmSync(output, { recursive: true, force: true })
  }
}

export const describeDuplicate = ({ first, second, lines }: Duplicate) =>
  `${first.name}:${first.start}-${first.end}  repeats ${second.name}:${second.start}-${second.end} (${lines} lines)`
