import { expect, test } from 'vitest'
import { fixWithoutTest, isFix, isTest } from '../pull-request.mjs'

test.each([
  'apps/web/src/lib/dictionary/urls.test.ts',
  'apps/web/src/components/dictionary/word-page.interaction.test.tsx',
  'apps/web/e2e/search.spec.ts',
  'apps/web/scripts/smoke.sh',
  'apps/dictionary-api/src/conformance/detail.conformance.test.ts',
  'apps/ios/Modules/Tests/SearchExperienceTests/WordListsTests.swift',
  'apps/ios/UITests/SearchUITests.swift',
  'apps/ios/Tools/TranslateReplay/Tests/TranslateReplayTests/ScoringTests.swift',
  'apps/ios/Tools/tests/test_compound_pitch_contract.py',
  'apps/ios/LanguageData/Conformance/word-detail.json',
  'language-data/pipeline/tests/test_build.py',
  'tools/checks/src/agents/settings.test.ts'
])('counts %s as a test', path => {
  expect(isTest(path)).toBe(true)
})

test.each([
  'apps/web/src/lib/dictionary/urls.ts',
  'apps/web/e2e/test.ts',
  'apps/dictionary-api/src/conformance/support.ts',
  'apps/ios/Modules/Tests/SearchExperienceTests/Fixtures/jiten-anime.json.zip',
  'apps/ios/UITests/CommonSteps.swift',
  'apps/ios/UITests/Platform/TestDevice.swift',
  'apps/web/scripts/wait-for-dictionary-service.sh',
  '.github/workflows/web-deploy.yml',
  'docs/agents/web.md',
  'apps/ios/Tools/import_kanjivg.py'
])("doesn't count %s as a test", path => {
  expect(isTest(path)).toBe(false)
})

test('a fix/ branch needs a test among its changes', () => {
  expect(fixWithoutTest('fix/slash-redirect', '', ['apps/web/next.config.ts'])).toBe(true)
  expect(
    fixWithoutTest('fix/slash-redirect', '', [
      'apps/web/next.config.ts',
      'apps/web/e2e/urls.spec.ts'
    ])
  ).toBe(false)
})

test('so does a pull request titled as a fix, whatever its branch', () => {
  const branch = 'issue-12-slash-redirect'
  expect(fixWithoutTest(branch, 'fix: www reaches the apex in one hop', ['next.config.ts'])).toBe(
    true
  )
  expect(fixWithoutTest(branch, 'fix(web)!: drop the old redirect', ['next.config.ts'])).toBe(true)
  expect(
    fixWithoutTest(branch, 'fix: the Back button shows on the Mac', [
      'apps/ios/UITests/NavigationUITests.swift'
    ])
  ).toBe(false)
})

test('other branches and titles need none', () => {
  expect(fixWithoutTest('chore/bump-node', 'chore: Node 24', ['package.json'])).toBe(false)
  expect(fixWithoutTest('docs/web', 'docs: fix: is a type', ['docs/agents/web.md'])).toBe(false)
  expect(isFix('feat/12-fixes', 'feat: fixes are listed in the changelog')).toBe(false)
})
