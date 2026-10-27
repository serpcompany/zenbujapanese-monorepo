import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { isolateHarness } from './test-env.mjs'

const { stateDir } = await isolateHarness()
const { breakStaleLock, takeLock } = await import('./lock.mjs')

const lockPath = join(stateDir, 'lock')
const deadPid = () => spawnSync(process.execPath, ['-e', '']).pid

afterEach(() => {
  for (const path of [lockPath, `${lockPath}.break`]) rmSync(path, { force: true })
})

it('keeps the fresh lock when a slower agent comes to remove the dead owner it saw', () => {
  const dead = deadPid()
  writeFileSync(lockPath, String(dead))
  takeLock()
  breakStaleLock(dead)
  expect(readFileSync(lockPath, 'utf8')).toBe(String(process.pid))
  expect(() => takeLock()).toThrow(`Chrome is in use by pid ${process.pid}`)
})

it('says which file to remove when an agent died while taking the lock', () => {
  const dead = deadPid()
  writeFileSync(lockPath, String(deadPid()))
  writeFileSync(`${lockPath}.break`, String(dead))
  expect(() => takeLock()).toThrow(`pid ${dead} died while taking the lock`)
  expect(existsSync(lockPath)).toBe(true)
})

it("removes a dead agent's leftover link file once it holds the lock, and keeps a live one's", () => {
  const dead = join(stateDir, `lock.${deadPid()}`)
  const live = join(stateDir, `lock.${process.ppid}`)
  writeFileSync(dead, '')
  writeFileSync(live, '')
  takeLock()
  expect(existsSync(dead)).toBe(false)
  expect(existsSync(live)).toBe(true)
})
