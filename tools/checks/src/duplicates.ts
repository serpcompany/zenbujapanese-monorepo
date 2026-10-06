import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { classify, type Language, root } from './files'

const minimumTokens = 50
const minimumLines = 5

const scannedLanguages: ReadonlySet<Language> = new Set(['typescript', 'swift', 'python', 'shell'])
const jscpdFormats = 'typescript,tsx,javascript,swift,python,bash'

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
    return kind.kind === 'code' && scannedLanguages.has(kind.language)
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
    return readClones(readFileSync(join(output, 'jscpd-report.json'), 'utf8'))
  } finally {
    rmSync(output, { recursive: true, force: true })
  }
}

export const describeDuplicate = ({ first, second, lines }: Duplicate) =>
  `${first.name}:${first.start}-${first.end}  repeats ${second.name}:${second.start}-${second.end} (${lines} lines)`
