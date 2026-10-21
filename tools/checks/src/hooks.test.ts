import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { outsideGit, scratchFolder } from './agents/scratch'
import { readRepositoryFile } from './agents/workflow'

const settings = JSON.parse(readRepositoryFile('.claude/settings.json')) as {
  hooks: Record<string, { hooks: { command: string }[] }[]>
}
const hooks = [
  ['edit', settings.hooks.PostToolUse[0].hooks[0].command, 'hook'],
  ['stop', settings.hooks.Stop[0].hooks[0].command, 'stop-hook']
] as const
const input = '{"session_id":"session-1"}'
const verdict = 2
const serpVerifyThatRecordsItsCall = [
  '#!/bin/sh',
  'echo "$*" >"$(dirname "$0")/called"',
  'cat >"$(dirname "$0")/input"',
  `exit ${verdict}`,
  ''
].join('\n')

function checkout(installed: boolean): string {
  const folder = join(scratchFolder('hooks'), 'a checkout')
  const bin = join(folder, 'node_modules', '.bin')
  mkdirSync(bin, { recursive: true })
  if (installed) {
    writeFileSync(join(bin, 'serp-verify'), serpVerifyThatRecordsItsCall, { mode: 0o755 })
  }
  return folder
}

const run = (command: string, folder: string, inGitHubActions = false) =>
  spawnSync('sh', ['-c', command], {
    input,
    encoding: 'utf8',
    env: outsideGit({ CLAUDE_PROJECT_DIR: folder, GITHUB_ACTIONS: inGitHubActions ? 'true' : '' })
  })

describe.each(hooks)('the %s hook', (name, command, subcommand) => {
  test(`hands its input to serp-verify ${subcommand}, and serp-verify's verdict back`, () => {
    const folder = checkout(true)
    const result = run(command, folder)
    const bin = join(folder, 'node_modules', '.bin')
    expect(result.status).toBe(verdict)
    expect(readFileSync(join(bin, 'called'), 'utf8')).toBe(`${subcommand}\n`)
    expect(readFileSync(join(bin, 'input'), 'utf8')).toBe(input)
  })

  test('says the checks need an install where the checkout has none', () => {
    const folder = checkout(false)
    const result = run(command, folder)
    expect(result.status).toBe(name === 'edit' ? 2 : 1)
    expect(result.stderr).toContain(`The checks can't run in ${folder}`)
  })

  test('passes in a GitHub Actions job that installed nothing', () => {
    const result = run(command, checkout(false), true)
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
  })
})
