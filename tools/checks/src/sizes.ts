import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Language } from './files'
import { classify, root } from './files'

export const lineLimit = 500

export const knownLargeFiles: Readonly<Record<string, number>> = {
  'apps/ios/Modules/Sources/SearchExperience/ExampleSentenceClient.swift': 948,
  'apps/ios/Modules/Sources/SearchExperience/FrequencyPack.swift': 773,
  'apps/ios/Modules/Sources/SearchExperience/FrequencyPackManager.swift': 585,
  'apps/ios/Modules/Sources/SearchExperience/ImageTextFlowModel.swift': 507,
  'apps/ios/Modules/Sources/SearchExperience/ImageTextFlowView.swift': 782,
  'apps/ios/Modules/Sources/SearchExperience/KanjiDetailView.swift': 694,
  'apps/ios/Modules/Sources/SearchExperience/LinkedJapaneseText.swift': 551,
  'apps/ios/Modules/Sources/SearchExperience/LookupClient.swift': 1022,
  'apps/ios/Modules/Sources/SearchExperience/SearchView.swift': 1101,
  'apps/ios/Modules/Sources/SearchExperience/WatchAndListenView.swift': 699,
  'apps/ios/Modules/Sources/SearchExperience/WordDetailView.swift': 968,
  'apps/ios/Tools/import_jmdict.py': 1168,
  'language-data/pipeline/package.py': 725,
  'language-data/pipeline/publish.py': 526,
  'language-data/pipeline/tests/test_package.py': 801,
  'language-data/pipeline/tests/test_publish.py': 716,
  'packages/dictionary-core/src/detail/conjugation.ts': 550,
  'packages/dictionary-core/src/search/search.ts': 760
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

export function checkSizes(
  files: readonly string[],
  known: Readonly<Record<string, number>> = knownLargeFiles
): SizeProblem[] {
  const problems: SizeProblem[] = []
  const present = new Set(files)
  for (const path of files) {
    const kind = classify(path)
    if (kind.kind !== 'code' || !measured.has(kind.language)) continue
    const lines = lineCount(path)
    const ceiling = known[path]
    if (ceiling === undefined) {
      if (lines > lineLimit) {
        problems.push({ path, problem: `has ${lines} lines, over the limit of ${lineLimit}` })
      }
    } else if (lines > ceiling) {
      problems.push({ path, problem: `grew to ${lines} lines, over its recorded ${ceiling}` })
    } else if (lines <= lineLimit) {
      problems.push({
        path,
        problem: `is down to ${lines} lines: remove it from knownLargeFiles`
      })
    } else if (lines < ceiling) {
      problems.push({
        path,
        problem: `is down to ${lines} lines: lower its entry in knownLargeFiles to ${lines}`
      })
    }
  }
  for (const path of Object.keys(known)) {
    if (!present.has(path)) {
      problems.push({ path, problem: 'no longer exists: remove it from knownLargeFiles' })
    }
  }
  return problems
}
