import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { follow, loadChecks, owningCheckout, refuseUninstalled, routeHook } from './route.mjs'

const input = readFileSync(0, 'utf8') || '{}'
const edited = JSON.parse(input).tool_input?.file_path
if (!edited || !existsSync(edited)) process.exit(0)

const file = resolve(edited)
const folder = dirname(file)
if (spawnSync('git', ['check-ignore', '--quiet', file], { cwd: folder }).status === 0) {
  process.exit(0)
}
const route = routeHook(owningCheckout(folder), 'hook.mjs')
if (route.kind === 'install') refuseUninstalled(route.checkout)
follow(route, input)

const { editHook } = await loadChecks(() => import('./src/hook.ts'))
await editHook(file)
