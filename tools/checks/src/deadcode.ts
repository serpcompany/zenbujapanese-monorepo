import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { root } from './files'

function knipBin(): string {
  const main = createRequire(import.meta.url).resolve('knip')
  return join(dirname(main), '..', 'bin', 'knip.js')
}

export function findDeadCode(): string[] {
  const run = spawnSync(process.execPath, [knipBin(), '--no-progress', '--no-config-hints'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' }
  })
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim()
  if (run.status === 0) return []
  if (run.status !== 1) throw new Error(`knip failed: ${output}`)
  return output.split('\n').map(line => line.trimEnd())
}
