import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import {
  alreadyTold,
  changedPaths,
  follow,
  loadChecks,
  owningCheckout,
  refuseUninstalled,
  routeHook,
  toldFile
} from './route.mjs'

const input = readFileSync(0, 'utf8') || '{}'
const call = JSON.parse(input)
if (call.stop_hook_active || process.env.GITHUB_ACTIONS === 'true') process.exit(0)

const checkout = owningCheckout(call.cwd ?? process.cwd())
const route = routeHook(checkout, 'stop-hook.mjs')
follow(route, input)

const git = (...args) => spawnSync('git', args, { cwd: checkout, encoding: 'utf8' }).stdout ?? ''
const changed = changedPaths(
  git('diff', '--name-only', '--diff-filter=d', '-z', 'HEAD'),
  git('ls-files', '--others', '--exclude-standard', '-z')
)
if (!changed.length) process.exit(0)

const refuse = () =>
  refuseUninstalled(checkout, advice => alreadyTold(toldFile(checkout, call.session_id), advice))
if (route.kind === 'install') refuse()

const { stopHook } = await loadChecks(() => import('./src/stop-hook.ts'), refuse)
await stopHook(changed, call.session_id)
