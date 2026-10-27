import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { isolateHarness } from './test-env.mjs'

const { stateDir, controlPort } = await isolateHarness()

it("fails with the holder's pid when the control port is taken, and touches nothing", async () => {
  const holder = createServer()
  await new Promise(done => holder.listen(controlPort, '127.0.0.1', done))
  const statePath = join(stateDir, 'state.json')
  const lockPath = join(stateDir, 'lock')
  const state = JSON.stringify({ pid: process.pid })
  writeFileSync(statePath, state)
  writeFileSync(lockPath, String(process.pid))
  const run = spawnSync(process.execPath, [join(import.meta.dirname, 'daemon.mjs')], {
    encoding: 'utf8',
    timeout: 20_000
  })
  holder.close()
  expect(run.status).toBe(1)
  expect(run.stderr).toContain(`Chrome is in use by pid ${process.pid}`)
  expect(readFileSync(statePath, 'utf8')).toBe(state)
  expect(readFileSync(lockPath, 'utf8')).toBe(String(process.pid))
})
