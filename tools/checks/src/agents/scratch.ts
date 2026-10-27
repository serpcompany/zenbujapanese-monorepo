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

const callersGit = [
  'GIT_AUTHOR_NAME',
  'GIT_AUTHOR_EMAIL',
  'GIT_COMMITTER_NAME',
  'GIT_COMMITTER_EMAIL',
  'GIT_CONFIG_COUNT'
]

export const outsideGit = (changes: Record<string, string | undefined> = {}) => ({
  ...withoutGitLocation(process.env),
  ...Object.fromEntries(callersGit.map(name => [name, undefined])),
  ...changes
})

export const git = (folder: string, ...command: string[]) =>
  spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...command], {
    cwd: folder,
    encoding: 'utf8',
    env: outsideGit()
  })
