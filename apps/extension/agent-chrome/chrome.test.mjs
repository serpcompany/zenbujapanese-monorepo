import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isolateHarness } from './test-env.mjs'

const { stateDir } = await isolateHarness()
const { startChrome, stopChrome } = await import('./chrome.mjs')
const { withChrome } = await import('./run.mjs')
const { isAlive } = await import('./files.mjs')
const { readState } = await import('./connect.mjs')

const daemon = join(import.meta.dirname, 'test-daemon.mjs')
const lockPath = join(stateDir, 'lock')
const deadPid = () => spawnSync(process.execPath, ['-e', '']).pid

afterEach(async () => {
  await stopChrome()
  delete process.env.TEST_DAEMON_MODE
})

describe('startChrome', () => {
  it('takes the lock for its daemon and gives it back on stop', async () => {
    const state = await startChrome({ daemon })
    expect(readState().pid).toBe(state.pid)
    expect(Number(readFileSync(lockPath, 'utf8'))).toBe(state.pid)
    expect(await stopChrome(state)).toBe('stopped')
    expect(existsSync(lockPath)).toBe(false)
    expect([state.pid, state.chromePid].some(isAlive)).toBe(false)
  })

  it('refuses a second start at once and leaves the first running', async () => {
    const first = await startChrome({ daemon })
    const started = Date.now()
    await expect(startChrome({ daemon })).rejects.toThrow(`Chrome is in use by pid ${first.pid}`)
    expect(Date.now() - started).toBeLessThan(1000)
    expect(isAlive(first.pid) && isAlive(first.chromePid)).toBe(true)
    expect(readState().pid).toBe(first.pid)
  })

  it('takes a lock whose owner is dead', async () => {
    writeFileSync(lockPath, String(deadPid()))
    const state = await startChrome({ daemon })
    expect(isAlive(state.pid)).toBe(true)
  })

  it("accepts only its own daemon's state", async () => {
    const other = { pid: process.pid, extensions: {}, ready: true }
    writeFileSync(join(stateDir, 'state.json'), JSON.stringify(other))
    const state = await startChrome({ daemon })
    expect(state.pid).not.toBe(process.pid)
  })

  it('does not stop a Chrome another run started', async () => {
    const state = await startChrome({ daemon })
    expect(await stopChrome({ pid: deadPid() })).toMatch(/^not stopped/)
    expect(isAlive(state.pid)).toBe(true)
  })

  it('stops the daemon and Chrome when a requested extension never loads', async () => {
    await expect(startChrome({ daemon, ext: ['/no/such/build'] })).rejects.toThrow(
      'could not load /no/such/build'
    )
    expect(readState()).toBeNull()
    expect(existsSync(lockPath)).toBe(false)
  })
})

describe('withChrome', () => {
  it('stops a daemon that never gets ready, and Chrome, and never drives', async () => {
    process.env.TEST_DAEMON_MODE = 'stuck'
    const drive = vi.fn()
    const spawned = []
    const watch = setInterval(() => {
      const state = readState()
      if (state && !spawned.length) spawned.push(state.pid, state.chromePid)
    }, 50)
    await expect(withChrome({ daemon, startTimeoutMs: 1500 }, drive)).rejects.toThrow(
      'did not start in time'
    )
    clearInterval(watch)
    expect(drive).not.toHaveBeenCalled()
    expect(spawned).toHaveLength(2)
    expect(spawned.some(isAlive)).toBe(false)
    expect(existsSync(lockPath)).toBe(false)
  })
})
