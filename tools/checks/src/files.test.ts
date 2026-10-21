import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { scratchFolder } from './agents/scratch'
import { isMeasuredCode, isWrittenHere, readVerifyConfig, repositoryFiles } from './files'
import { matchesGlob } from './glob'
import { filesNearLimit, lineLimit, nearLimitLines } from './near-limit'

test.each([
  ['apps/account-api/migrations/**', 'apps/account-api/migrations/meta/0001.json', true],
  ['apps/account-api/migrations/**', 'apps/account-api/src/db.ts', false],
  ['**/*.{pbxproj,xcscheme}', 'apps/ios/App.xcodeproj/project.pbxproj', true],
  ['**/*.{pbxproj,xcscheme}', 'project.xcscheme', true],
  ['**/Package.resolved', 'apps/ios/Modules/Package.resolved', true],
  ['FrequencyPackMappingV*.sql', 'FrequencyPackMappingV2.sql', true],
  ['FrequencyPackMappingV*.sql', 'nested/FrequencyPackMappingV2.sql', false],
  ['sources/Kanji-*/*.html', 'sources/Kanji-N5/page.html', true],
  ['sources/Kanji-*/*.html', 'sources/Kanji-N5/deeper/page.html', false],
  ['pnpm-lock.yaml', 'apps/web/pnpm-lock.yaml', false]
])('the glob %s matches %s: %s', (pattern, path, matches) => {
  expect(matchesGlob(pattern, path)).toBe(matches)
})

const config = {
  files: {
    generated: { 'apps/web/cloudflare-env.d.ts': 'wrangler types' },
    thirdParty: { 'vendor/**': 'a vendor' },
    pinned: { 'pinned/*.sql': 'a checksum' }
  },
  exceptions: { knownLargeFiles: { 'excepted.ts': { lines: 900, reason: 'unsafe to split now' } } }
}

test("measures the code written here, and no tool's, vendor's, or pinned file", () => {
  const folder = scratchFolder('files')
  writeFileSync(join(folder, 'deploy'), '#!/usr/bin/env bash\necho deploy\n')
  writeFileSync(join(folder, 'Dockerfile'), 'FROM node\n')
  expect(isMeasuredCode('apps/web/src/page.tsx', config, folder)).toBe(true)
  expect(isMeasuredCode('tools/script.py', config, folder)).toBe(true)
  expect(isMeasuredCode('deploy', config, folder)).toBe(true)
  expect(isMeasuredCode('Dockerfile', config, folder)).toBe(false)
  expect(isMeasuredCode('docs/guide.md', config, folder)).toBe(false)
  expect(isMeasuredCode('apps/web/cloudflare-env.d.ts', config, folder)).toBe(false)
  expect(isMeasuredCode('vendor/lib.js', config, folder)).toBe(false)
  expect(isWrittenHere('vendor/NOTICE.md', config)).toBe(false)
  expect(isWrittenHere('pinned/v1.sql', config)).toBe(false)
  expect(isWrittenHere('docs/guide.md', config)).toBe(true)
})

test('lists code files near the limit, leaving out the excepted ones and the rest', () => {
  const folder = scratchFolder('near-limit')
  const lines = (count: number) => 'const line = 1\n'.repeat(count)
  writeFileSync(join(folder, 'near.ts'), lines(nearLimitLines))
  writeFileSync(join(folder, 'at-limit.swift'), lines(lineLimit))
  writeFileSync(join(folder, 'over.ts'), lines(lineLimit + 1))
  writeFileSync(join(folder, 'short.ts'), lines(nearLimitLines - 1))
  writeFileSync(join(folder, 'excepted.ts'), lines(nearLimitLines))
  writeFileSync(join(folder, 'notes.md'), lines(nearLimitLines))
  const files = ['near.ts', 'at-limit.swift', 'over.ts', 'short.ts', 'excepted.ts', 'notes.md']
  expect(filesNearLimit(files, config, folder)).toEqual([
    { path: 'at-limit.swift', lines: lineLimit },
    { path: 'near.ts', lines: nearLimitLines }
  ])
})

test("reads the repository's verify.json, whose file classes cover what the report reads", () => {
  const repository = readVerifyConfig()
  const files = repositoryFiles()
  expect(files.filter(path => !isWrittenHere(path, repository))).toEqual(
    expect.arrayContaining([
      'pnpm-lock.yaml',
      'apps/web/cloudflare-env.d.ts',
      'apps/ios/Modules/Sources/SearchExperience/Resources/Kuromoji/NOTICE.md'
    ])
  )
  expect(repository.docs?.pathRoots).toEqual(expect.arrayContaining(['apps', 'docs', '.github']))
})
