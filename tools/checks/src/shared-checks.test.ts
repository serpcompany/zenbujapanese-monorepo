import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { git, outsideGit, scratchFolder } from './agents/scratch'
import { root } from './files'
import { checkProblems } from './shared-checks'

const output = [
  '',
  'comments',
  'a.ts:1:1  // a comment',
  'b.ts:4:3  // another',
  'Code has no comments.',
  '',
  'docs',
  'Skipped 3 links to serpcompany repositories: there is no token to read them with.',
  '',
  'linters',
  "ShellCheck didn't run.",
  'Linters run in Docker.',
  '',
  'comments failed, docs passed, sizes passed, linters failed (/work/checkout)',
  ''
].join('\n')

test("keeps each failed check's findings, without its rule, and leaves a passed check's notes out", () => {
  expect(checkProblems(output, ['comments', 'docs', 'sizes'])).toEqual([
    { name: 'comments', problems: ['a.ts:1:1  // a comment', 'b.ts:4:3  // another'] },
    { name: 'docs', problems: [] },
    { name: 'sizes', problems: [] }
  ])
})

test('keeps what a check that failed without a finding said, or that it failed', () => {
  expect(checkProblems(output, ['linters'])).toEqual([
    { name: 'linters', problems: ["ShellCheck didn't run.", 'Linters run in Docker.'] }
  ])
  expect(checkProblems('\nsizes failed (/work/checkout)\n', ['sizes'])).toEqual([
    { name: 'sizes', problems: ['sizes failed'] }
  ])
})

const serpVerify = (checkout: string, names: readonly string[], env = outsideGit()) =>
  spawnSync(join(root, 'node_modules', '.bin', 'serp-verify'), [names.join(',')], {
    cwd: checkout,
    encoding: 'utf8',
    env
  })

test('reads what the installed serp-verify prints', () => {
  const checkout = scratchFolder('shared-checks')
  git(checkout, 'init', '--quiet')
  writeFileSync(join(checkout, 'kept.ts'), 'export const kept = 1 // a comment\n')
  const run = serpVerify(checkout, ['comments', 'sizes'])
  expect(run.status).toBe(1)
  expect(checkProblems(run.stdout, ['comments', 'sizes'])).toEqual([
    { name: 'comments', problems: ['kept.ts:1:23  // a comment'] },
    { name: 'sizes', problems: [] }
  ])
})

test('counts lefthook as used on a runner with no git hooks and no CI setting, as the report runs', () => {
  const checkout = scratchFolder('shared-checks-lefthook')
  git(checkout, 'init', '--quiet')
  const knip = JSON.parse(readFileSync(join(root, 'knip.json'), 'utf8'))
  writeFileSync(
    join(checkout, 'knip.json'),
    JSON.stringify({ workspaces: { '.': knip.workspaces['.'] } })
  )
  writeFileSync(
    join(checkout, 'package.json'),
    JSON.stringify({ name: 'hooked', private: true, devDependencies: { lefthook: '2.0.15' } })
  )
  writeFileSync(
    join(checkout, 'lefthook.yml'),
    'pre-commit:\n  commands:\n    hello:\n      run: echo hello\n'
  )
  const run = serpVerify(checkout, ['deadcode'], outsideGit({ CI: '' }))
  expect(checkProblems(run.stdout, ['deadcode'])).toEqual([{ name: 'deadcode', problems: [] }])
})
