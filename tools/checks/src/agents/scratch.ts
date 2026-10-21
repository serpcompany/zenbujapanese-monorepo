import { spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach } from 'vitest'
import { withoutGitLocation } from '../../git-environment.mjs'

const folders: string[] = []

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

export function scratchFolder(name: string): string {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), `zenbu-${name}-`)))
  folders.push(folder)
  return folder
}

export const outsideGit = (changes: Record<string, string | undefined> = {}) => ({
  ...withoutGitLocation(process.env),
  ...changes
})

export const git = (folder: string, ...command: string[]) =>
  spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...command], {
    cwd: folder,
    encoding: 'utf8',
    env: outsideGit()
  })
