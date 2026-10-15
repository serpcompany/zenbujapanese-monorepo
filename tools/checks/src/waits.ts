import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { root } from './files'

const uiTestFolder = 'apps/ios/UITests/'

const xcuiTestWait =
  /\b(waitForExistence|waitForNonExistence|XCTNSPredicateExpectation|XCTWaiter|waitForExpectations)\b/

const fixedPause = /\bRunLoop\.(?:current|main)\.run\(|\bu?sleep\(/

interface AllowedPauses {
  pauses: number
  proves: string
}

const ui = (file: string) => `${uiTestFolder}${file}`

const allowedPauses: Readonly<Record<string, AllowedPauses>> = {
  [ui('ZenbuUITestCase.swift')]: {
    pauses: 2,
    proves:
      "nothing: they are comesTrue's wait between two looks and waitUntilStill's second between two looks at a frame"
  },
  [ui('ExampleRowsUITests.swift')]: {
    pauses: 2,
    proves:
      'no row changes its height, and the opened sentence keeps its place, once held answers are let go'
  },
  [ui('LayoutUITests.swift')]: { pauses: 1, proves: "the iPhone doesn't turn" },
  [ui('SearchInputUITests.swift')]: { pauses: 1, proves: 'the input panel stays open' },
  [ui('TranslateUITests.swift')]: {
    pauses: 1,
    proves: 'the word sheet stays up after Return in its note'
  },
  [ui('KeyboardAndWindowUITests.swift')]: {
    pauses: 2,
    proves:
      'nothing on screen to wait for yet: a window taking keyboard focus after Escape, and a shortcut pressed over a sheet'
  },
  [ui('WordDetailUITests.swift')]: {
    pauses: 1,
    proves:
      'nothing on screen to wait for yet: the pointer moving off a headword before its picture'
  }
}

interface WaitProblem {
  path: string
  line: number
  problem: string
}

const readRepositoryFile = (path: string) => readFileSync(join(root, path), 'utf8')

const linesMatching = (lines: readonly string[], pattern: RegExp) =>
  lines.flatMap((text, index) => (pattern.test(text) ? [index + 1] : []))

function pauseProblems(path: string, pauses: number[], allowed?: AllowedPauses): WaitProblem[] {
  const allowance = allowed?.pauses ?? 0
  if (pauses.length > allowance) {
    return pauses.map(line => ({
      path,
      line,
      problem: `pauses a fixed time, one of ${pauses.length} pauses where allowedPauses lets it have ${allowance}${allowed ? ` (they prove ${allowed.proves})` : ''}`
    }))
  }
  if (pauses.length < allowance) {
    return [
      {
        path,
        line: pauses[0] ?? 1,
        problem: `pauses ${pauses.length} times, fewer than the ${allowance} allowedPauses gives it: lower its entry`
      }
    ]
  }
  return []
}

export function findUITestWaits(
  files: readonly string[],
  read: (path: string) => string = readRepositoryFile,
  allowed: Readonly<Record<string, AllowedPauses>> = allowedPauses
): WaitProblem[] {
  return files
    .filter(path => path.startsWith(uiTestFolder) && path.endsWith('.swift'))
    .flatMap(path => {
      const lines = read(path).split('\n')
      const waits = lines.flatMap((text, index) => {
        const wait = xcuiTestWait.exec(text)?.[1]
        return wait ? [{ path, line: index + 1, problem: `calls ${wait}` }] : []
      })
      return [...waits, ...pauseProblems(path, linesMatching(lines, fixedPause), allowed[path])]
    })
}
