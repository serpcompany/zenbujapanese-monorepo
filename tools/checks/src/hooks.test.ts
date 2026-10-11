import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { root } from './files'

const folders: string[] = []
const scratch = () => {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), 'zenbu-hooks-')))
  folders.push(folder)
  return folder
}

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

const run = (script: string, input: object) =>
  spawnSync(process.execPath, [join(root, 'tools', 'checks', script)], {
    input: JSON.stringify(input),
    encoding: 'utf8'
  })

function otherCheckout(script: string, installed: boolean): string {
  const checkout = scratch()
  spawnSync('git', ['init', '--quiet'], { cwd: checkout })
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

test('the stop hook leaves a folder outside every repository alone', () => {
  expect(run('stop-hook.mjs', { cwd: scratch() }).status).toBe(0)
})
