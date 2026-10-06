import { expect, test } from 'vitest'
import { fixWithoutTest, isTest } from './fixes'

test.each([
  'apps/web/src/lib/dictionary/urls.test.ts',
  'apps/web/src/components/dictionary/word-page.interaction.test.tsx',
  'apps/web/e2e/search.spec.ts',
  'apps/web/scripts/smoke.sh',
  'apps/dictionary-api/src/conformance/detail.conformance.test.ts',
  'apps/ios/Modules/Tests/SearchExperienceTests/WordListsTests.swift',
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
  'apps/web/scripts/wait-for-dictionary-service.sh',
  '.github/workflows/web-deploy.yml',
  'docs/agents/web.md',
  'apps/ios/Tools/import_kanjivg.py'
])("doesn't count %s as a test", path => {
  expect(isTest(path)).toBe(false)
})

test('a fix/ branch needs a test among its changes', () => {
  expect(fixWithoutTest('fix/slash-redirect', ['apps/web/next.config.ts'])).toBe(true)
  expect(
    fixWithoutTest('fix/slash-redirect', ['apps/web/next.config.ts', 'apps/web/e2e/urls.spec.ts'])
  ).toBe(false)
})

test('other branches need none', () => {
  expect(fixWithoutTest('chore/bump-node', ['package.json'])).toBe(false)
  expect(fixWithoutTest('docs/web', ['docs/agents/web.md'])).toBe(false)
})
