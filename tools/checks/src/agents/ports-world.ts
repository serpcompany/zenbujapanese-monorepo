import { mkdirSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { answerTo } from '../../ports.mjs'
import { scratchFolder } from './scratch'

interface Machine {
  git: (folder: string, ...command: string[]) => string | undefined
  now: () => number
  pause: (milliseconds: number) => void
  running: (pid: number) => boolean
  pid: number
}

interface Repository {
  main: string
  worktrees: Map<string, string>
}

const lockOf = (main: string) => join(main, '.git', 'zenbu-ports', 'lock')
const firstPid = 70_000

export const claims = (main: string) => readdirSync(join(main, '.git', 'zenbu-ports')).sort()

export function packageFolder(checkout: string): string {
  const folder = join(checkout, 'apps', 'web')
  mkdirSync(folder, { recursive: true })
  return folder
}

export function aWorld() {
  const repositories: Repository[] = []
  const stillGoing = new Set<number>()
  const meanwhile: { after: number; then: () => void }[] = []
  let now = Math.floor(Date.now() / 1000) * 1000
  let waited = 0
  let lastPid = firstPid

  const checkoutOf = (folder: string) =>
    repositories
      .flatMap(repository =>
        [repository.main, ...repository.worktrees.keys()].map(top => ({ repository, top }))
      )
      .filter(({ top }) => folder === top || folder.startsWith(`${top}/`))
      .sort((one, other) => other.top.length - one.top.length)[0]

  const git = (folder: string, ...command: string[]) => {
    const found = checkoutOf(folder)
    if (!found) return undefined
    const { repository, top } = found
    const common = join(repository.main, '.git')
    if (command[0] === 'worktree') {
      return [repository.main, ...repository.worktrees.keys()]
        .map(each => `worktree ${each}\nHEAD 0000000\ndetached\n`)
        .join('\n')
    }
    const name = repository.worktrees.get(top)
    const answer = name
      ? [top, join(common, 'worktrees', name), common]
      : [top, folder === top ? '.git' : common, relative(folder, common)]
    return `${answer.join('\n')}\n`
  }

  const aRun = () => {
    lastPid += 1
    return lastPid
  }

  const asker = (): Machine => {
    const pid = aRun()
    stillGoing.add(pid)
    return {
      git,
      now: () => now,
      pause(milliseconds: number) {
        now += milliseconds
        waited += milliseconds
        const due = meanwhile.findIndex(each => waited >= each.after)
        if (due !== -1) meanwhile.splice(due, 1)[0].then()
      },
      running: (holder: number) => stillGoing.has(holder),
      pid
    }
  }

  const ask = (command: string[], folder: string) => answerTo(command, folder, asker())

  return {
    asker,
    ask,
    portsOf: (folder: string): Record<string, number> =>
      JSON.parse(ask(['--json'], folder) ?? 'null'),
    repository() {
      const main = scratchFolder('ports')
      mkdirSync(join(main, '.git'))
      repositories.push({ main, worktrees: new Map() })
      return main
    },
    worktree(main: string, name: string) {
      const folder = join(main, '.claude', 'worktrees', name)
      mkdirSync(folder, { recursive: true })
      repositories.find(each => each.main === main)?.worktrees.set(folder, name)
      return folder
    },
    aRunStillGoing() {
      const pid = aRun()
      stillGoing.add(pid)
      return pid
    },
    aRunThatEnded: aRun,
    holdLock(
      main: string,
      { holder, secondsAgo = 0 }: { holder?: number; secondsAgo?: number } = {}
    ) {
      mkdirSync(lockOf(main), { recursive: true })
      if (holder !== undefined) writeFileSync(join(lockOf(main), 'holder'), String(holder))
      const taken = (now - secondsAgo * 1000) / 1000
      utimesSync(lockOf(main), taken, taken)
    },
    releaseLock: (main: string) => rmSync(lockOf(main), { recursive: true, force: true }),
    meanwhile(after: number, then: () => void) {
      meanwhile.push({ after, then })
    },
    secondsWaited: () => Math.floor(waited / 1000)
  }
}

export type World = ReturnType<typeof aWorld>
