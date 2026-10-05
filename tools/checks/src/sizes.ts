import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Language } from './files'
import { classify, root } from './files'

export const lineLimit = 500

export const nearLimitLines = 450

export interface SizeException {
  lines: number
  reason: string
}

const swiftCantBeCheckedHere =
  'Swift: the machines agents work on here can neither build nor test it, so splitting it waits for a Mac that can check the result'

export const knownLargeFiles: Readonly<Record<string, SizeException>> = {
  'apps/ios/Modules/Sources/SearchExperience/FrequencyPackManager.swift': {
    lines: 585,
    reason: swiftCantBeCheckedHere
  },
  'apps/ios/Modules/Sources/SearchExperience/ImageTextFlowModel.swift': {
    lines: 507,
    reason: swiftCantBeCheckedHere
  },
  'apps/ios/Modules/Sources/SearchExperience/ImageTextFlowView.swift': {
    lines: 782,
    reason: swiftCantBeCheckedHere
  },
  'apps/ios/Modules/Sources/SearchExperience/KanjiDetailView.swift': {
    lines: 694,
    reason: swiftCantBeCheckedHere
  },
  'apps/ios/Modules/Sources/SearchExperience/WatchAndListenView.swift': {
    lines: 699,
    reason: swiftCantBeCheckedHere
  }
}

const measured = new Set<Language>(['typescript', 'swift', 'python', 'shell'])

export interface SizeProblem {
  path: string
  problem: string
}

function lineCount(path: string): number {
  const text = readFileSync(join(root, path), 'utf8')
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
}

export function filesNearLimit(
  files: readonly string[],
  known: Readonly<Record<string, SizeException>> = knownLargeFiles
): { path: string; lines: number }[] {
  return files
    .filter(path => {
      const kind = classify(path)
      return kind.kind === 'code' && measured.has(kind.language) && known[path] === undefined
    })
    .map(path => ({ path, lines: lineCount(path) }))
    .filter(({ lines }) => lines >= nearLimitLines && lines <= lineLimit)
    .sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path))
}

export function checkSizes(
  files: readonly string[],
  known: Readonly<Record<string, SizeException>> = knownLargeFiles
): SizeProblem[] {
  const problems: SizeProblem[] = []
  for (const path of files) {
    const kind = classify(path)
    if (kind.kind !== 'code' || !measured.has(kind.language)) continue
    const lines = lineCount(path)
    const exception = known[path]
    if (exception === undefined) {
      if (lines > lineLimit) {
        problems.push({ path, problem: `has ${lines} lines, over the limit of ${lineLimit}` })
      }
    } else if (!exception.reason.trim()) {
      problems.push({ path, problem: 'is excepted from the limit without a reason' })
    } else if (lines > exception.lines) {
      problems.push({
        path,
        problem: `grew to ${lines} lines, over its recorded ${exception.lines}`
      })
    } else if (lines <= lineLimit) {
      problems.push({
        path,
        problem: `is down to ${lines} lines: remove it from knownLargeFiles`
      })
    } else if (lines < exception.lines) {
      problems.push({
        path,
        problem: `is down to ${lines} lines: lower its entry in knownLargeFiles to ${lines}`
      })
    }
  }
  for (const path of Object.keys(known)) {
    if (!existsSync(join(root, path))) {
      problems.push({ path, problem: 'no longer exists: remove it from knownLargeFiles' })
    }
  }
  return problems
}
