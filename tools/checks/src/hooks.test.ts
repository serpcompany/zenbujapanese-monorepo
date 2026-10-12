import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { git, outsideGit, scratchFolder } from './agents/scratch'
import { root } from './files'

const scratch = () => scratchFolder('hooks')

const run = (script: string, input: object, inGitHubActions = false) =>
  spawnSync(process.execPath, [join(root, 'tools', 'checks', script)], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: outsideGit({ GITHUB_ACTIONS: inGitHubActions ? 'true' : '' })
  })

function committed(checkout: string): string {
  git(checkout, 'add', '--all')
  git(checkout, 'commit', '--quiet', '--message', 'Start')
  return checkout
}

function otherCheckout(script: string, installed: boolean): string {
  const checkout = scratch()
  git(checkout, 'init', '--quiet')
  mkdirSync(join(checkout, 'tools', 'checks'), { recursive: true })
  writeFileSync(
    join(checkout, 'tools', 'checks', script),
    "process.stderr.write('checked by its own checkout')\nprocess.exit(2)\n"
  )
  if (installed) mkdirSync(join(checkout, 'tools', 'checks', 'node_modules'))
  writeFileSync(join(checkout, 'probe.ts'), 'export const probe = 1\n')
  return checkout
}

test('the edit hook runs the checks of the checkout that owns the file', () => {
  const checkout = otherCheckout('hook.mjs', true)
  const result = run('hook.mjs', { tool_input: { file_path: join(checkout, 'probe.ts') } })
  expect(result.status).toBe(2)
  expect(result.stderr).toContain('checked by its own checkout')
})

test('the edit hook asks for an install where the owning checkout has none', () => {
  const checkout = otherCheckout('hook.mjs', false)
  const result = run('hook.mjs', { tool_input: { file_path: join(checkout, 'probe.ts') } })
  expect(result.status).toBe(2)
  expect(result.stderr).toContain(`The checks can't run in ${checkout}`)
})

test('the edit hook passes in a GitHub Actions job that installed nothing', () => {
  const checkout = otherCheckout('hook.mjs', false)
  const call = { tool_input: { file_path: join(checkout, 'probe.ts') } }
  expect(run('hook.mjs', call, true).status).toBe(0)
})

test('the edit hook leaves a file outside every repository alone', () => {
  const folder = scratch()
  writeFileSync(join(folder, 'probe.ts'), 'export const probe = 1\n')
  const result = run('hook.mjs', { tool_input: { file_path: join(folder, 'probe.ts') } })
  expect(result.status).toBe(0)
})

test('the stop hook blocks a turn once, never twice in a row', () => {
  const result = run('stop-hook.mjs', { stop_hook_active: true, cwd: root })
  expect(result.status).toBe(0)
  expect(result.stderr).toBe('')
})

test('the stop hook runs the checks of the checkout the session works in', () => {
  const checkout = otherCheckout('stop-hook.mjs', true)
  const result = run('stop-hook.mjs', { cwd: checkout })
  expect(result.status).toBe(2)
  expect(result.stderr).toContain('checked by its own checkout')
})

test('the stop hook passes a checkout without packages while nothing has changed', () => {
  const checkout = committed(otherCheckout('stop-hook.mjs', false))
  const result = run('stop-hook.mjs', { cwd: checkout, session_id: 'session-1' })
  expect(result.status).toBe(0)
  expect(result.stderr).toBe('')
})

test('the stop hook asks a session once for an install, where a change waits to be checked', () => {
  const checkout = committed(otherCheckout('stop-hook.mjs', false))
  writeFileSync(join(checkout, 'probe.ts'), 'export const probe = 2\n')
  const first = run('stop-hook.mjs', { cwd: checkout, session_id: 'session-1' })
  expect(first.status).toBe(2)
  expect(first.stderr).toContain(`The checks can't run in ${checkout}`)
  expect(run('stop-hook.mjs', { cwd: checkout, session_id: 'session-1' }).status).toBe(0)
  expect(run('stop-hook.mjs', { cwd: checkout, session_id: 'session-2' }).status).toBe(2)
})

test.each([
  ['installed nothing', false],
  ['installed its packages', true]
])('the stop hook leaves a GitHub Actions job that %s to its own checks', (_, installed) => {
  const checkout = committed(otherCheckout('stop-hook.mjs', installed))
  writeFileSync(join(checkout, 'probe.ts'), 'export const probe = 2\n')
  const result = run('stop-hook.mjs', { cwd: checkout, session_id: 'session-1' }, true)
  expect(result.status).toBe(0)
  expect(result.stderr).toBe('')
})

test('the stop hook leaves a folder outside every repository alone', () => {
  expect(run('stop-hook.mjs', { cwd: scratch() }).status).toBe(0)
})
