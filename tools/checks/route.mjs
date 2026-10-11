import { spawnSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(dirname(dirname(fileURLToPath(import.meta.url))))

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

export function follow(route, input) {
  if (route.kind === 'here') return
  if (route.kind === 'skip') process.exit(0)
  if (route.kind === 'install') {
    process.stderr.write(`${installAdvice(route.checkout)}\n`)
    process.exit(2)
  }
  const result = spawnSync(process.execPath, [route.script], { input, encoding: 'utf8' })
  if (result.stderr) process.stderr.write(result.stderr)
  process.exit(result.status ?? 1)
}

export async function loadChecks(load) {
  let tsx
  try {
    tsx = await import('tsx/esm/api')
  } catch {
    process.stderr.write(`${installAdvice(here)}\n`)
    process.exit(2)
  }
  tsx.register()
  return load()
}
