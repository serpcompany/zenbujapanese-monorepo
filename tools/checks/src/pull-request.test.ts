import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import {
  isConventionalTitle,
  issueRule,
  noIssueReason,
  otherBase,
  titleRule
} from '../pull-request.mjs'
import { root } from './files'

test.each([
  'fix: Escape closes the Settings window',
  'feat(web): the kana charts open each kana',
  'chore!: drop Node 20',
  'perf: linked sentences are as fast as the Swift was'
])('takes %s as a Conventional Commit title', title => {
  expect(isConventionalTitle(title)).toBe(true)
})

test.each([
  'Cover Tomodachi itself in the Privacy Policy and on Support',
  'Website: the kana charts',
  'fix:no space',
  'fix: ',
  'Fix: capitalised',
  'bugfix: an unknown type'
])("doesn't take %s", title => {
  expect(isConventionalTitle(title)).toBe(false)
})

test('reads the reason from a line that says there is no issue', () => {
  expect(noIssueReason('No issue: a typo in a workflow name\n\n## Why')).toBe(
    'No issue: a typo in a workflow name'
  )
  expect(noIssueReason('## Why\nno issue: found while reviewing')).toBe(
    'no issue: found while reviewing'
  )
  expect(noIssueReason('No issue:\n')).toBeUndefined()
  expect(noIssueReason('There is no issue: see below')).toBeUndefined()
  expect(noIssueReason('Part of #12')).toBeUndefined()
})

const run = (check: string, env: Record<string, string>) =>
  spawnSync(process.execPath, [join(root, 'tools', 'checks', 'pull-request.mjs'), check], {
    env: { PATH: process.env.PATH ?? '', ...env },
    encoding: 'utf8'
  })

test('the title check passes a typed title and explains a plain one', () => {
  expect(run('title', { PR_TITLE: 'docs: the stage and commands are in AGENTS.md' }).status).toBe(0)
  const plain = run('title', { PR_TITLE: 'Say the stage in AGENTS.md; $(rm -rf .)' })
  expect(plain.status).toBe(1)
  expect(plain.stdout).toContain('"Say the stage in AGENTS.md; $(rm -rf .)"')
  expect(plain.stdout).toContain(titleRule)
})

test('the issue-link check takes a stated reason without asking GitHub', () => {
  const exempt = run('issue-link', { PR_BODY: 'No issue: a doc fix found on the way' })
  expect(exempt.status).toBe(0)
  expect(exempt.stdout).toContain('No issue: a doc fix found on the way')
  expect(issueRule).toContain('Closes #<number>')
})

test('a pull request stacked on another branch is told why GitHub links no issue to it yet', () => {
  expect(otherBase('feat/701-parent', 'main')).toContain('based on feat/701-parent, not main')
  expect(otherBase('feat/701-parent', 'main')).toContain('once it is retargeted')
  expect(otherBase('main', 'main')).toBe('')
  expect(otherBase(undefined, 'main')).toBe('')
  expect(otherBase('main', undefined)).toBe('')
})
