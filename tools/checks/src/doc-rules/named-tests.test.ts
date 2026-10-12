import { describe, expect, test } from 'vitest'
import { isTestSource, missingTest, testsIn } from './named-tests'
import { homePackage, packagePath } from './package-paths'

const tests = testsIn(
  new Map([
    [
      'apps/ios/UITests/SearchUITests.swift',
      'final class SearchUITests: ZenbuUITestCase {\n  func testAQueryWithNoMatchesSaysSo() {}\n}'
    ],
    [
      'apps/ios/UITests/SearchInputUITests.swift',
      'extension SearchUITests {\n  func testTheFieldOffersClose() throws {}\n}\nfinal class SearchInputUITests: ZenbuUITestCase {}'
    ],
    [
      'apps/ios/Modules/Tests/SearchExperienceTests/AppCommandTests.swift',
      '@Suite("Menu commands")\nstruct AppCommandTests {\n  @Test func everyTabHasAShortcut() {}\n}'
    ],
    [
      'apps/ios/Tools/tests/test_simulator.py',
      'class SimulatorTests(unittest.TestCase):\n    def test_delete(self) -> None: ...'
    ],
    ['apps/web/e2e/page-types.ts', 'export function testEachPageType(name: string) {}']
  ])
)

describe('a test a doc names', () => {
  test.each([
    'apps/ios/UITests/SearchUITests.swift',
    'apps/ios/Modules/Tests/TranslatorCoreTests/StartTests.swift',
    'apps/ios/Tools/TranslateReplay/Tests/ReplayTests/ScoreTests.swift',
    'apps/ios/Tools/tests/test_simulator.py',
    'apps/web/e2e/page-types.ts',
    'apps/web/src/lib/site.test.ts',
    'apps/dictionary-api/src/conformance/suites.ts'
  ])('is looked for in %s', path => {
    expect(isTestSource(path)).toBe(true)
  })

  test.each([
    'apps/ios/Modules/Sources/SearchExperience/SearchView.swift',
    'apps/web/src/lib/site.ts',
    'apps/ios/Tools/simulator.py'
  ])('is not looked for in %s', path => {
    expect(isTestSource(path)).toBe(false)
  })

  test.each([
    'SearchUITests.testAQueryWithNoMatchesSaysSo',
    'SearchUITests.testTheFieldOffersClose',
    'testAQueryWithNoMatchesSaysSo',
    'testEachPageType',
    'SearchUITests',
    'AppCommandTests',
    'SimulatorTests',
    'SearchExperienceTests',
    'ZenbuJapaneseUITests',
    'AppCommandTests.everyTabHasAShortcut',
    'pnpm test',
    'tests',
    'src/lib/site.test.ts'
  ])('passes %s, which exists or names no test', code => {
    expect(missingTest(code, tests)).toBeUndefined()
  })

  test.each([
    ['SearchUITests.testItWasRenamed', 'SearchUITests has no test called testItWasRenamed'],
    ['SearchInputUITests.testAQueryWithNoMatchesSaysSo', 'SearchInputUITests has no test called'],
    ['RemovedUITests.testAQueryWithNoMatchesSaysSo', 'no test type is called RemovedUITests'],
    ['testItWasRenamed', 'no test is called that'],
    ['RemovedUITests', 'no test type or target is called that']
  ])('reports %s, which nothing defines', (code, problem) => {
    expect(missingTest(code, tests)).toContain(problem)
  })
})

describe('a path a doc names inside its package', () => {
  const folders = new Set(['apps/web', 'apps/dictionary-api', 'packages/dictionary-core'])
  const isFolder = (path: string) => folders.has(path)

  test.each([
    ['apps/web/docs/product/dictionary.md', 'apps/web'],
    ['apps/ios/docs/product/index.md', 'apps/ios'],
    ['docs/agents/web.md', 'apps/web'],
    ['docs/agents/dictionary-core.md', 'packages/dictionary-core'],
    ['docs/agents/ci.md', undefined],
    ['docs/quality.md', undefined],
    ['AGENTS.md', undefined]
  ])("is resolved from %s's package, %s", (doc, home) => {
    expect(homePackage(doc, isFolder)).toBe(home)
  })

  test.each([
    ['src/lib/site.test.ts', 'apps/web/src/lib/site.test.ts'],
    ['e2e/urls.spec.ts:35', 'apps/web/e2e/urls.spec.ts'],
    ['./scripts/smoke.sh,', 'apps/web/scripts/smoke.sh'],
    ['src/app/dictionary/[word]/page.tsx', 'apps/web/src/app/dictionary/[word]/page.tsx'],
    ['src/lib/', 'apps/web/src/lib']
  ])('reads %s as %s', (code, path) => {
    expect(packagePath(code, 'apps/web')).toBe(path)
  })

  test.each([
    'apps/web/src/lib/site.ts',
    'pnpm test',
    'src',
    'https://example.com/src/x'
  ])('leaves %s alone', code => {
    expect(packagePath(code, 'apps/web')).toBeUndefined()
  })
})
