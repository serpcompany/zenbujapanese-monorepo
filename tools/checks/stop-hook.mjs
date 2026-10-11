import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { changedPaths, follow, loadChecks, owningCheckout, routeHook } from './route.mjs'

const input = readFileSync(0, 'utf8') || '{}'
const call = JSON.parse(input)
if (call.stop_hook_active) process.exit(0)

const checkout = owningCheckout(call.cwd ?? process.cwd())
follow(routeHook(checkout, 'stop-hook.mjs'), input)

const git = (...args) => spawnSync('git', args, { cwd: checkout, encoding: 'utf8' }).stdout ?? ''
const changed = changedPaths(
  git('diff', '--name-only', '--diff-filter=d', '-z', 'HEAD'),
  git('ls-files', '--others', '--exclude-standard', '-z')
)
if (!changed.length) process.exit(0)

const { stopHook } = await loadChecks(() => import('./src/stop-hook.ts'))
await stopHook(changed, call.session_id)
