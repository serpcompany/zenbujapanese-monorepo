import { spawn, spawnSync } from 'node:child_process'
import {
  existsSync,
  linkSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'
import { withoutGitLocation } from './route.mjs'

export const mainPorts = { site: 3000, e2e: 3100, preview: 8787, dictionary: 8788 }
export const roles = Object.keys(mainPorts)
export const firstWorktreePort = 21000
export const portsPerWorktree = 10
export const lastSlot = 999
const claimsFolder = 'zenbu-ports'
const slotName = /^[1-9]\d{0,2}$/
const lockName = 'lock'
const holderName = 'holder'
const lockWait = 30_000
const lockPause = 25
const lockAbandonedAfter = 10_000
const placeholder = '@port'
const settingsFlag = '--settings'
const usage = `Usage:
  ports.mjs                  this checkout's local addresses
  ports.mjs --json           its ports, as JSON
  ports.mjs run <role> [${settingsFlag} <file>] -- <command> [arguments]
                             runs the command with PORT set to the role's port, unless the
                             shell or the file sets PORT; ${placeholder} in an argument is the port
  ports.mjs delete           gives up this worktree's ports
  ports.mjs prune            gives up the ports of worktrees that are gone
Roles: ${roles.join(', ')}`

const real = path => {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

export function portsFor(slot) {
  if (slot === 0) return { ...mainPorts }
  const first = firstWorktreePort + portsPerWorktree * slot
  return Object.fromEntries(roles.map((role, index) => [role, first + index]))
}

const thisMachine = {
  git(folder, ...command) {
    const result = spawnSync('git', command, {
      cwd: folder,
      encoding: 'utf8',
      env: withoutGitLocation(process.env)
    })
    return result.status === 0 ? result.stdout : undefined
  },
  now: () => Date.now(),
  pause(milliseconds) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
  },
  running(pid) {
    try {
      process.kill(pid, 0)
      return true
    } catch (error) {
      return error.code === 'EPERM'
    }
  },
  pid: process.pid
}

function checkoutIn(folder, machine) {
  const found = machine.git(folder, 'rev-parse', '--show-toplevel', '--git-dir', '--git-common-dir')
  if (found === undefined) return undefined
  const [top, gitDir, commonDir] = found
    .split('\n')
    .filter(Boolean)
    .map(path => real(resolve(folder, path)))
  if (!top || !gitDir || !commonDir) return undefined
  return { top, worktree: gitDir !== commonDir, claims: join(commonDir, claimsFolder) }
}

function worktreesIn(folder, machine) {
  const listed = machine.git(folder, 'worktree', 'list', '--porcelain')
  if (listed === undefined) return undefined
  const paths = listed
    .split('\n')
    .filter(line => line.startsWith('worktree '))
    .map(line => line.slice('worktree '.length))
  return new Set(paths.filter(path => existsSync(path)).map(real))
}

function claimsIn(folder) {
  if (!existsSync(folder)) return []
  return readdirSync(folder)
    .filter(name => slotName.test(name))
    .flatMap(name => {
      try {
        return [{ slot: Number(name), owner: readFileSync(join(folder, name), 'utf8').trim() }]
      } catch {
        return []
      }
    })
    .sort((one, other) => one.slot - other.slot)
}

function heldByARunningProcess(lock, machine) {
  try {
    const holder = Number(readFileSync(join(lock, holderName), 'utf8'))
    return Number.isInteger(holder) && holder > 0 && machine.running(holder)
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

const abandoned = (lock, machine) =>
  machine.now() - statSync(lock).mtimeMs >= lockAbandonedAfter &&
  !heldByARunningProcess(lock, machine)

function breakAbandoned(lock, machine) {
  const aside = `${lock}.${machine.pid}`
  try {
    if (!abandoned(lock, machine)) return
    renameSync(lock, aside)
    if (abandoned(aside, machine)) rmSync(aside, { recursive: true, force: true })
    else renameSync(aside, lock)
  } catch (error) {
    rmSync(aside, { recursive: true, force: true })
    if (error.code !== 'ENOENT') throw error
  }
}

function locked(folder, work, machine) {
  mkdirSync(folder, { recursive: true })
  const lock = join(folder, lockName)
  const giveUpAt = machine.now() + lockWait
  for (;;) {
    try {
      mkdirSync(lock)
      break
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
    breakAbandoned(lock, machine)
    if (machine.now() > giveUpAt) {
      throw new Error(`Another run has held ${lock} for ${lockWait / 1000} seconds. Remove it.`)
    }
    machine.pause(lockPause)
  }
  try {
    writeFileSync(join(lock, holderName), String(machine.pid))
    return work()
  } finally {
    rmSync(lock, { recursive: true, force: true })
  }
}

const release = (folder, slot) => rmSync(join(folder, String(slot)), { force: true })

function releaseWhere(folder, isTheirs) {
  const theirs = claimsIn(folder).filter(isTheirs)
  for (const claim of theirs) release(folder, claim.slot)
  return theirs
}

const forgetGone = (folder, worktrees) =>
  worktrees ? releaseWhere(folder, claim => !worktrees.has(claim.owner)) : []

const underLock = (folder, work, machine) =>
  existsSync(folder) ? locked(folder, work, machine) : []

const prune = (folder, worktreesNow, machine) =>
  underLock(folder, () => forgetGone(folder, worktreesNow()), machine)

const giveUp = (folder, owner, machine) =>
  underLock(folder, () => releaseWhere(folder, claim => claim.owner === owner), machine)

function claim(draft, slotFile, content) {
  try {
    linkSync(draft, slotFile)
  } catch (error) {
    if (error.code === 'EEXIST') throw error
    writeFileSync(slotFile, content, { flag: 'wx' })
  }
}

function take(folder, owner, machine) {
  const content = `${owner}\n`
  const draft = join(folder, `claim.${machine.pid}`)
  writeFileSync(draft, content)
  try {
    for (let slot = 1; slot <= lastSlot; slot += 1) {
      try {
        claim(draft, join(folder, String(slot)), content)
        return
      } catch (error) {
        if (error.code !== 'EEXIST') throw error
      }
    }
  } finally {
    rmSync(draft, { force: true })
  }
  throw new Error(
    `Every block of ports is taken (${folder}). Run "node tools/checks/ports.mjs prune".`
  )
}

function slotOf(folder, owner, worktreesNow, machine) {
  const mine = () => claimsIn(folder).filter(each => each.owner === owner)
  const [held] = mine()
  if (held) return held.slot
  return locked(
    folder,
    () => {
      if (mine().length === 0) {
        forgetGone(folder, worktreesNow())
        take(folder, owner, machine)
      }
      const [first, ...extra] = mine()
      for (const each of extra) release(folder, each.slot)
      return first.slot
    },
    machine
  )
}

function slotIn(checkout, folder, machine) {
  if (!checkout?.worktree) return 0
  return slotOf(checkout.claims, checkout.top, () => worktreesIn(folder, machine), machine)
}

const addressOf = port => `http://localhost:${port}`

function settingsIn(file) {
  if (!file || !existsSync(file)) return {}
  return parseEnv(readFileSync(file, 'utf8'))
}

export function launch(port, command, environment, fileSettings) {
  const chosen = environment.PORT ?? fileSettings.PORT
  const effective = chosen ?? String(port)
  const [program, ...rest] = command.map(part => part.replaceAll(placeholder, effective))
  const env = chosen === undefined ? { ...environment, PORT: effective } : { ...environment }
  return { program, arguments: rest, env }
}

export function commandToRun(rest, folder, environment, machine = thisMachine) {
  const dashes = rest.indexOf('--')
  const [role, flag, file, ...more] = dashes === -1 ? [] : rest.slice(0, dashes)
  const command = dashes === -1 ? [] : rest.slice(dashes + 1)
  const named = flag === undefined || (flag === settingsFlag && file !== undefined)
  if (!roles.includes(role) || !named || more.length > 0 || command.length === 0) return undefined
  const port = portsFor(slotIn(checkoutIn(folder, machine), folder, machine))[role]
  return launch(port, command, environment, settingsIn(file && resolve(folder, file)))
}

function runCommand(rest, folder) {
  const started = commandToRun(rest, folder, process.env)
  if (!started) return refuse()
  const child = spawn(started.program, started.arguments, {
    stdio: 'inherit',
    env: started.env,
    shell: process.platform === 'win32'
  })
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => child.kill(signal))
  child.on('error', error => {
    process.stderr.write(`${started.program} didn't start: ${error.message}\n`)
    process.exit(127)
  })
  child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)))
}

function refuse() {
  process.stderr.write(`${usage}\n`)
  process.exit(2)
}

const freed = claims =>
  claims.length === 0
    ? 'Nothing to give up.'
    : claims
        .map(
          claim => `Gave up ${addressOf(portsFor(claim.slot).site)} and its block (${claim.owner}).`
        )
        .join('\n')

const answered = [undefined, '--json', 'delete', 'prune']

export function answerTo(argv, folder, machine = thisMachine) {
  const [command, ...rest] = argv
  if (rest.length > 0 || !answered.includes(command)) return undefined
  const checkout = checkoutIn(folder, machine)
  if (command === 'delete') {
    if (!checkout?.worktree) {
      return 'This checkout uses the main ports. Only a worktree has a block to give up.'
    }
    return freed(giveUp(checkout.claims, checkout.top, machine))
  }
  if (command === 'prune') {
    return freed(
      checkout ? prune(checkout.claims, () => worktreesIn(folder, machine), machine) : []
    )
  }
  const ports = portsFor(slotIn(checkout, folder, machine))
  if (command === '--json') return JSON.stringify(ports)
  return roles.map(role => `${role.padEnd(11)}${addressOf(ports[role])}`).join('\n')
}

function main(argv, folder = process.cwd()) {
  const [command, ...rest] = argv
  if (command === 'run') return runCommand(rest, folder)
  const answer = answerTo(argv, folder)
  if (answer === undefined) return refuse()
  console.log(answer)
}

if (process.argv[1] && import.meta.url === pathToFileURL(real(process.argv[1])).href) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exit(1)
  }
}
