import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, openSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromeOnDevtoolsPort, readState } from './connect.mjs'
import { isAlive } from './files.mjs'
import { handLockTo, lockOwner, releaseLock, takeLock } from './lock.mjs'
import { daemonLog, devtoolsPort, here, logDir } from './paths.mjs'

export const launchOptions = {
  headless: { type: 'boolean', default: false },
  ext: { type: 'string', multiple: true, default: [] },
  net: { type: 'string', default: '' },
  persistent: { type: 'boolean', default: false },
  online: { type: 'boolean', default: false },
  'map-host': { type: 'string', multiple: true, default: [] },
  'host-rule': { type: 'string', multiple: true, default: [] },
  unmute: { type: 'boolean', default: false },
  pages: { type: 'string', default: 'runtime' }
}

export const sleep = ms => new Promise(done => setTimeout(done, ms))

export async function control(path) {
  const state = readState()
  if (!state) throw new Error('agent Chrome is not running')
  const response = await fetch(`${state.controlURL}${path}`)
  return response.json()
}

export async function whoHoldsChrome() {
  const state = readState()
  if (state) return { harness: state }
  const owner = lockOwner()
  if (isAlive(owner)) return { starting: owner }
  const browser = await chromeOnDevtoolsPort()
  return browser ? { other: browser } : null
}

async function refuseOtherChrome() {
  const browser = await chromeOnDevtoolsPort()
  if (!browser) return
  throw new Error(
    `${browser} is on port ${devtoolsPort}, probably the old tmp/agent/agent-chrome harness. One Chrome per Mac: wait for it to stop.`
  )
}

function daemonArgs(options) {
  const args = ['--pages', options.pages ?? 'runtime']
  if (options.headless) args.push('--headless')
  if (options.unmute) args.push('--unmute')
  if (options.persistent) args.push('--persistent')
  if (options.online) args.push('--online')
  if (options.net) args.push('--net', options.net)
  for (const host of options.mapHost ?? []) args.push('--map-host', host)
  for (const rule of options.hostRule ?? []) args.push('--host-rule', rule)
  for (const extension of options.ext ?? []) args.push('--ext', resolve(extension))
  return args
}

function lastDaemonLine() {
  if (!existsSync(daemonLog)) return 'no daemon.log'
  return readFileSync(daemonLog, 'utf8').trimEnd().split('\n').at(-1)
}

function startFailure(state, wanted, exit) {
  if (exit) return `the daemon exited (${exit}): ${lastDaemonLine()}`
  if (state?.ready) {
    const missing = wanted.filter(path => !state.extensions[path])
    return `could not load ${missing.join(', ')}: ${JSON.stringify(state.loadErrors ?? {})}`
  }
  return `the daemon did not start in time; see ${daemonLog}`
}

export async function startChrome(options) {
  takeLock()
  try {
    await refuseOtherChrome()
  } catch (error) {
    releaseLock(process.pid)
    throw error
  }
  mkdirSync(logDir, { recursive: true })
  const out = openSync(daemonLog, 'a')
  const daemon = options.daemon ?? join(here, 'daemon.mjs')
  const child = spawn(process.execPath, [daemon, ...daemonArgs(options)], {
    detached: true,
    stdio: ['ignore', out, out],
    cwd: here
  })
  child.unref()
  handLockTo(child.pid)
  let exit = null
  child.on('exit', (code, signal) => {
    exit = signal ?? `code ${code}`
  })
  const wanted = (options.ext ?? []).map(path => resolve(path))
  const until = Date.now() + (options.startTimeoutMs ?? 60_000)
  let state = null
  while (Date.now() < until && !exit) {
    state = readState()
    const mine = state?.pid === child.pid ? state : null
    if (mine?.ready) {
      if (wanted.every(path => mine.extensions[path])) return mine
      break
    }
    await sleep(300)
  }
  const reason = startFailure(state?.pid === child.pid ? state : null, wanted, exit)
  await stopProcesses(state?.pid === child.pid ? state : { pid: child.pid })
  releaseLock(child.pid)
  throw new Error(reason)
}

async function waitForExit(pids, ms) {
  const until = Date.now() + ms
  while (pids.some(isAlive)) {
    if (Date.now() >= until) return false
    await sleep(200)
  }
  return true
}

function signal(pids, name) {
  for (const pid of pids) {
    try {
      process.kill(pid, name)
    } catch {}
  }
}

async function stopProcesses({ pid, chromePid, controlURL }) {
  const pids = [chromePid, pid].filter(Boolean)
  const asked =
    controlURL &&
    (await fetch(`${controlURL}/quit`, { signal: AbortSignal.timeout(5000) }).then(
      () => true,
      () => false
    ))
  if (asked && (await waitForExit(pids, 20_000))) return 'stopped'
  signal(pids, 'SIGTERM')
  if (await waitForExit(pids, 5000)) return 'stopped (SIGTERM)'
  signal(pids, 'SIGKILL')
  await waitForExit(pids, 5000)
  return 'stopped (SIGKILL)'
}

export async function stopChrome(own) {
  const state = readState()
  if (!state) return 'not running'
  if (own && state.pid !== own.pid) {
    return `not stopped: the running Chrome is daemon pid ${state.pid}, not this run's ${own.pid}`
  }
  const result = await stopProcesses(state)
  releaseLock(state.pid)
  return result
}

export function extensionId(state, path) {
  const id = state.extensions[resolve(path)]
  if (!id) throw new Error(`${path} is not loaded: ${JSON.stringify(state.extensions)}`)
  return id
}
