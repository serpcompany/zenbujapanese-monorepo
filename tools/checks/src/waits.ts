import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { root } from './files'

const uiTestFolder = 'apps/ios/UITests/'

const xcuiTestWait =
  /\b(waitForExistence|XCTNSPredicateExpectation|XCTWaiter|waitForExpectations)\b/

export interface WaitProblem {
  path: string
  line: number
  wait: string
}

const readRepositoryFile = (path: string) => readFileSync(join(root, path), 'utf8')

export function findXCUITestWaits(
  files: readonly string[],
  read: (path: string) => string = readRepositoryFile
): WaitProblem[] {
  return files
    .filter(path => path.startsWith(uiTestFolder) && path.endsWith('.swift'))
    .flatMap(path =>
      read(path)
        .split('\n')
        .flatMap((text, index) => {
          const wait = xcuiTestWait.exec(text)?.[1]
          return wait ? [{ path, line: index + 1, wait }] : []
        })
    )
}
