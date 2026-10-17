const swiftTestFile = /^apps\/ios\/(?:.*\/)?(?:Tests|UITests)\/.*\.swift$/
const pythonTestFile = /(?:^|\/)tests\/test_\w+\.py$/
const scriptTestFile =
  /(?:^|\/)(?:e2e|test|conformance)\/.*\.(?:tsx?|mjs)$|\.test\.tsx?$|(?:^|\/)(?:playwright|vitest)\.config\.ts$/
const testTarget = /^apps\/ios\/(?:.*?\/)?Tests\/([^/]+)\//
const uiTestTarget = 'ZenbuJapaneseUITests'

const pair = /^(\w+Tests)\.(\w+)$/
const method = /^test(?:[A-Z]\w*|_\w+)$/
const type = /^[A-Z]\w+Tests$/

export const isTestSource = (path: string) =>
  swiftTestFile.test(path) || pythonTestFile.test(path) || scriptTestFile.test(path)

export interface NamedTests {
  types: ReadonlyMap<string, ReadonlySet<string>>
  names: ReadonlySet<string>
}

export function testsIn(sources: ReadonlyMap<string, string>): NamedTests {
  const types = new Map<string, Set<string>>([[uiTestTarget, new Set()]])
  const names = new Set<string>()
  for (const [path, text] of sources) {
    const declared = [...text.matchAll(/\b(?:struct|class|enum|extension|actor)\s+(\w+)/g)]
    const own = [...text.matchAll(/\b(?:func|function|def)\s+(\w+)\s*[(<]/g)].map(found => found[1])
    const target = testTarget.exec(path)?.[1]
    for (const name of [...declared.map(found => found[1]), ...(target ? [target] : [])]) {
      const known = types.get(name) ?? new Set<string>()
      for (const each of own) known.add(each)
      types.set(name, known)
    }
    for (const [name] of text.matchAll(/\btest(?:[A-Z]\w*|_\w+)\b/g)) names.add(name)
  }
  return { types, names }
}

export function missingTest(code: string, tests: NamedTests): string | undefined {
  const named = pair.exec(code)
  if (named) {
    const [, owner, test] = named
    if (!tests.types.has(owner)) return `names ${code}, and no test type is called ${owner}`
    return tests.types.get(owner)?.has(test)
      ? undefined
      : `names ${code}, and ${owner} has no test called ${test}`
  }
  if (method.test(code)) {
    return tests.names.has(code) ? undefined : `names ${code}, and no test code names that`
  }
  if (type.test(code)) {
    return tests.types.has(code)
      ? undefined
      : `names ${code}, and no test type or target is called that`
  }
  return undefined
}

export const namedTestAdvice =
  "give the doc the test's new name, or restore the test: a doc that names a check nothing runs says a behavior is covered when it isn't"
