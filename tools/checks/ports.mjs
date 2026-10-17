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

function git(folder, ...command) {
  const result = spawnSync('git', command, {
    cwd: folder,
    encoding: 'utf8',
    env: withoutGitLocation(process.env)
  })
  return result.status === 0 ? result.stdout : undefined
}

function checkoutIn(folder) {
  const found = git(folder, 'rev-parse', '--show-toplevel', '--git-dir', '--git-common-dir')
  if (found === undefined) return undefined
  const [top, gitDir, commonDir] = found
    .split('\n')
    .filter(Boolean)
    .map(path => real(resolve(folder, path)))
  if (!top || !gitDir || !commonDir) return undefined
  return { top, worktree: gitDir !== commonDir, claims: join(commonDir, claimsFolder) }
}

function worktreesIn(folder) {
  const listed = git(folder, 'worktree', 'list', '--porcelain')
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

const pause = milliseconds =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)

function running(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

function heldByARunningProcess(lock) {
  try {
    return running(Number(readFileSync(join(lock, holderName), 'utf8')))
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

const abandoned = lock =>
  Date.now() - statSync(lock).mtimeMs >= lockAbandonedAfter && !heldByARunningProcess(lock)

function breakAbandoned(lock) {
  const aside = `${lock}.${process.pid}`
  try {
    if (!abandoned(lock)) return
    renameSync(lock, aside)
    if (abandoned(aside)) rmSync(aside, { recursive: true, force: true })
    else renameSync(aside, lock)
  } catch (error) {
    rmSync(aside, { recursive: true, force: true })
    if (error.code !== 'ENOENT') throw error
  }
}

function locked(folder, work) {
  mkdirSync(folder, { recursive: true })
  const lock = join(folder, lockName)
  const giveUpAt = Date.now() + lockWait
  for (;;) {
    try {
      mkdirSync(lock)
      break
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
    breakAbandoned(lock)
    if (Date.now() > giveUpAt) {
      throw new Error(`Another run has held ${lock} for ${lockWait / 1000} seconds. Remove it.`)
    }
    pause(lockPause)
  }
  try {
    writeFileSync(join(lock, holderName), String(process.pid))
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

const underLock = (folder, work) => (existsSync(folder) ? locked(folder, work) : [])

const prune = (folder, worktreesNow) => underLock(folder, () => forgetGone(folder, worktreesNow()))

const giveUp = (folder, owner) =>
  underLock(folder, () => releaseWhere(folder, claim => claim.owner === owner))

function claim(draft, slotFile, content) {
  try {
    linkSync(draft, slotFile)
  } catch (error) {
    if (error.code === 'EEXIST') throw error
    writeFileSync(slotFile, content, { flag: 'wx' })
  }
}

function take(folder, owner) {
  const content = `${owner}\n`
  const draft = join(folder, `claim.${process.pid}`)
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

function slotOf(folder, owner, worktreesNow) {
  const mine = () => claimsIn(folder).filter(each => each.owner === owner)
  const [held] = mine()
  if (held) return held.slot
  return locked(folder, () => {
    if (mine().length === 0) {
      forgetGone(folder, worktreesNow())
      take(folder, owner)
    }
    const [first, ...extra] = mine()
    for (const each of extra) release(folder, each.slot)
    return first.slot
  })
}

function slotIn(folder) {
  const checkout = checkoutIn(folder)
  if (!checkout?.worktree) return 0
  return slotOf(checkout.claims, checkout.top, () => worktreesIn(folder))
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

function runCommand(rest, folder) {
  const dashes = rest.indexOf('--')
  const [role, flag, file, ...more] = dashes === -1 ? [] : rest.slice(0, dashes)
  const command = dashes === -1 ? [] : rest.slice(dashes + 1)
  const named = flag === undefined || (flag === settingsFlag && file !== undefined)
  if (!roles.includes(role) || !named || more.length > 0 || command.length === 0) return refuse()
  const port = portsFor(slotIn(folder))[role]
  const started = launch(port, command, process.env, settingsIn(file && resolve(folder, file)))
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

function main([command, ...rest], folder = process.cwd()) {
  if (command === 'run') return runCommand(rest, folder)
  if (rest.length > 0) return refuse()
  const checkout = checkoutIn(folder)
  if (command === 'delete') {
    if (!checkout?.worktree) {
      console.log('This checkout uses the main ports. Only a worktree has a block to give up.')
      return
    }
    console.log(freed(giveUp(checkout.claims, checkout.top)))
    return
  }
  if (command === 'prune') {
    console.log(freed(checkout ? prune(checkout.claims, () => worktreesIn(folder)) : []))
    return
  }
  if (command !== undefined && command !== '--json') return refuse()
  const ports = portsFor(slotIn(folder))
  if (command === '--json') {
    console.log(JSON.stringify(ports))
    return
  }
  for (const role of roles) console.log(`${role.padEnd(11)}${addressOf(ports[role])}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(real(process.argv[1])).href) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exit(1)
  }
}
