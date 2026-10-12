import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const sessionName = /^[A-Za-z0-9_-]{1,128}$/

const real = path => {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

export function owningCheckout(folder) {
  const found = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: folder,
    encoding: 'utf8'
  })
  const checkout = found.status === 0 ? found.stdout.trim() : ''
  return checkout || undefined
}

export function routeHook(owner, script, home = here, has = existsSync) {
  if (!owner) return { kind: 'skip' }
  if (real(owner) === real(home)) return { kind: 'here' }
  const theirs = join(owner, 'tools', 'checks', script)
  if (!has(theirs)) return { kind: 'skip' }
  if (!has(join(owner, 'tools', 'checks', 'node_modules'))) {
    return { kind: 'install', checkout: owner }
  }
  return { kind: 'elsewhere', script: theirs }
}

export const installAdvice = checkout =>
  `The checks can't run in ${checkout}: its packages aren't installed. Run pnpm install there, then make this change again (docs/agents/code.md, Checks).`

export function changedPaths(...listings) {
  const paths = new Set()
  for (const listing of listings) {
    for (const path of listing.split('\0')) if (path) paths.add(path)
  }
  return [...paths].sort()
}

export function toldFile(checkout, session) {
  if (!session || !sessionName.test(session)) return undefined
  return join(checkout, 'tmp', 'agent', 'stop-hook', `${session}.txt`)
}

export function alreadyTold(file, report) {
  if (!file) return false
  const key = createHash('sha256').update(report).digest('hex')
  if (existsSync(file) && readFileSync(file, 'utf8') === key) return true
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, key)
  return false
}

export function refuseUninstalled(checkout = here, told = () => false) {
  const advice = installAdvice(checkout)
  if (process.env.GITHUB_ACTIONS === 'true' || told(advice)) process.exit(0)
  process.stderr.write(`${advice}\n`)
  process.exit(2)
}

export function follow(route, input) {
  if (route.kind === 'skip') process.exit(0)
  if (route.kind !== 'elsewhere') return
  const result = spawnSync(process.execPath, [route.script], {
    input,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
  if (result.stderr) process.stderr.write(result.stderr)
  process.exit(result.status ?? 1)
}

export async function loadChecks(load, refuse = refuseUninstalled) {
  let tsx
  try {
    tsx = await import('tsx/esm/api')
  } catch {
    refuse()
  }
  tsx.register()
  return load()
}
