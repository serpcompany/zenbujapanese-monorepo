import { spawn } from 'node:child_process'
import { mkdirSync, openSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromeOnDevtoolsPort, readState } from './connect.mjs'
import { here, logDir } from './paths.mjs'

export const launchOptions = {
  headless: { type: 'boolean', default: false },
  ext: { type: 'string', multiple: true, default: [] },
  net: { type: 'string', default: '' },
  persistent: { type: 'boolean', default: false },
  offline: { type: 'boolean', default: false },
  'map-host': { type: 'string', multiple: true, default: [] },
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
  const browser = await chromeOnDevtoolsPort()
  return browser ? { other: browser } : null
}

async function refuseWhenBusy() {
  const holder = await whoHoldsChrome()
  if (!holder) return
  const who = holder.harness
    ? `an agent Chrome started ${holder.harness.startedAt} from ${holder.harness.checkout}`
    : `${holder.other} on port 9339, probably the old tmp/agent/agent-chrome harness`
  throw new Error(`${who} is running. One Chrome per Mac: wait for it to stop.`)
}

export async function startChrome(options) {
  await refuseWhenBusy()
  mkdirSync(logDir, { recursive: true })
  const args = [join(here, 'daemon.mjs'), '--pages', options.pages ?? 'runtime']
  if (options.headless) args.push('--headless')
  if (options.unmute) args.push('--unmute')
  if (options.persistent) args.push('--persistent')
  if (options.offline) args.push('--offline')
  if (options.net) args.push('--net', options.net)
  for (const host of options.mapHost ?? []) args.push('--map-host', host)
  for (const extension of options.ext ?? []) args.push('--ext', resolve(extension))
  const out = openSync(join(logDir, 'daemon.log'), 'a')
  spawn(process.execPath, args, { detached: true, stdio: ['ignore', out, out], cwd: here }).unref()
  const until = Date.now() + 60_000
  while (Date.now() < until) {
    const state = readState()
    if (state && Object.keys(state.extensions).length >= (options.ext ?? []).length) return state
    await sleep(300)
  }
  throw new Error(`the daemon did not start; see ${join(logDir, 'daemon.log')}`)
}

export async function stopChrome() {
  const state = readState()
  if (!state) return 'not running'
  await control('/quit').catch(() => {})
  const until = Date.now() + 20_000
  while (Date.now() < until) {
    try {
      process.kill(state.pid, 0)
      await sleep(300)
    } catch {
      return 'stopped'
    }
  }
  process.kill(state.chromePid, 'SIGTERM')
  process.kill(state.pid, 'SIGTERM')
  return 'stopped (SIGTERM)'
}

export function extensionId(state, path) {
  const id = state.extensions[resolve(path)]
  if (!id) throw new Error(`${path} is not loaded: ${JSON.stringify(state.extensions)}`)
  return id
}
