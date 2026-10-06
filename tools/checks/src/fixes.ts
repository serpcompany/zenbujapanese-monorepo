const testPaths: readonly RegExp[] = [
  /\.(test|spec)\.[cm]?[jt]sx?$/,
  /(^|\/)test_[^/]+\.py$/,
  /^apps\/web\/scripts\/smoke\.sh$/,
  /^apps\/ios\/Modules\/Tests\/.+Tests\.swift$/,
  /^apps\/ios\/LanguageData\/Conformance\/[^/]+\.json$/
]

export const isTest = (path: string) => testPaths.some(pattern => pattern.test(path))

export const fixRule =
  "A fix/ branch fixes a bug, so it adds or changes the test that fails without the fix (docs/agents/code.md, Fixes): a unit test, a browser test, a conformance case, or a smoke check. If nothing can fail without this change (a typo, a workflow setting), it isn't a fix: open it from a branch named for what it is, such as chore/ or docs/."

export function fixWithoutTest(branch: string, changed: readonly string[]): boolean {
  return branch.startsWith('fix/') && !changed.some(isTest)
}
