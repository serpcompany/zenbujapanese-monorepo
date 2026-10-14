import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  firstWorktreePort,
  lastSlot,
  launch,
  mainPorts,
  portsFor,
  portsPerWorktree,
  roles
} from '../ports.mjs'
import { git, outsideGit, scratchFolder } from './agents/scratch'
import { readRepositoryFile } from './agents/workflow'
import { root } from './files'

const script = join(root, 'tools', 'checks', 'ports.mjs')
const scratch = () => scratchFolder('ports')

function repository(): string {
  const folder = scratch()
  git(folder, 'init', '--quiet')
  git(folder, 'commit', '--quiet', '--allow-empty', '--message', 'Start')
  return folder
}

function worktree(main: string, name: string): string {
  const folder = join(main, '.claude', 'worktrees', name)
  expect(git(main, 'worktree', 'add', '--quiet', '--detach', folder).status).toBe(0)
  return folder
}

const environment = (changes: Record<string, string> = {}) =>
  outsideGit({ PORT: undefined, ...changes })
const ports = (folder: string, ...command: string[]) =>
  spawnSync(process.execPath, [script, ...command], {
    cwd: folder,
    encoding: 'utf8',
    env: environment()
  })
const portsOf = (folder: string): Record<string, number> =>
  JSON.parse(ports(folder, '--json').stdout)
const block = (slot: number) => portsFor(slot)

function packageFolder(checkout: string): string {
  const folder = join(checkout, 'apps', 'web')
  mkdirSync(folder, { recursive: true })
  return folder
}

function twoWorktreesWithTheirBlocks() {
  const main = repository()
  const one = worktree(main, 'one')
  const other = worktree(main, 'other')
  expect(portsOf(one)).toEqual(block(1))
  expect(portsOf(other)).toEqual(block(2))
  return { main, one, other }
}
const claims = (main: string) => readdirSync(join(main, '.git', 'zenbu-ports')).sort()

const asking = (folder: string) =>
  new Promise<[string, string]>(done => {
    let said = ''
    const child = spawn(process.execPath, [script, '--json'], {
      cwd: folder,
      env: environment()
    })
    child.stdout.on('data', chunk => {
      said += chunk
    })
    child.on('close', () => done([folder, said.trim()]))
  })

describe('the ports of a checkout', () => {
  test('are the documented ones in the main checkout, which claims nothing', () => {
    const main = repository()
    expect(portsOf(main)).toEqual({ site: 3000, e2e: 3100, preview: 8787, dictionary: 8788 })
    expect(portsOf(packageFolder(main))).toEqual(mainPorts)
    expect(() => claims(main)).toThrow()
  })

  test('are the documented ones outside every repository', () => {
    expect(portsOf(scratch())).toEqual(mainPorts)
  })

  test("are a worktree's own block, the same each time it asks, from any folder in it", () => {
    const { main, one } = twoWorktreesWithTheirBlocks()
    expect(portsOf(one)).toEqual(block(1))
    expect(portsOf(packageFolder(one))).toEqual(block(1))
    expect(portsOf(main)).toEqual(mainPorts)
    expect(claims(main)).toEqual(['1', '2'])
  })

  test("are the worktree's own when git has named another folder, as it does for a hook", () => {
    const main = repository()
    const one = worktree(main, 'one')
    const hook = environment({ GIT_DIR: join(main, '.git', 'worktrees', 'one') })
    const asked = spawnSync(process.execPath, [script, '--json'], {
      cwd: packageFolder(one),
      encoding: 'utf8',
      env: hook
    })
    expect(JSON.parse(asked.stdout)).toEqual(block(1))
    expect(claims(main)).toEqual(['1'])
    expect(readFileSync(join(main, '.git', 'zenbu-ports', '1'), 'utf8')).toBe(`${one}\n`)
  })

  test('never overlap, and stay below the ports an operating system hands out itself', () => {
    const used = new Set<number>(Object.values(mainPorts))
    for (let slot = 1; slot <= lastSlot; slot += 1) {
      for (const port of Object.values(block(slot))) {
        expect(used.has(port), `${port} in block ${slot}`).toBe(false)
        used.add(port)
      }
    }
    expect(roles.length).toBeLessThanOrEqual(portsPerWorktree)
    expect(firstWorktreePort + portsPerWorktree * (lastSlot + 1)).toBeLessThan(32_768)
  })

  test('are printed as addresses, by role', () => {
    const one = worktree(repository(), 'one')
    expect(ports(one).stdout).toBe(
      [
        'site       http://localhost:21010',
        'e2e        http://localhost:21011',
        'preview    http://localhost:21012',
        'dictionary http://localhost:21013',
        ''
      ].join('\n')
    )
  })

  test('are given up by delete, and the next worktree takes the block', () => {
    const { main, one, other } = twoWorktreesWithTheirBlocks()
    expect(ports(one, 'delete').stdout).toContain('Gave up http://localhost:21010 and its block')
    expect(claims(main)).toEqual(['2'])
    expect(ports(one, 'delete').stdout).toBe('Nothing to give up.\n')
    expect(portsOf(worktree(main, 'third'))).toEqual(block(1))
    expect(portsOf(other)).toEqual(block(2))
    expect(ports(main, 'delete').stdout).toContain('This checkout uses the main ports')
  })

  test("prune gives up a block whose worktree's folder is gone, and no other", () => {
    const { main, one, other } = twoWorktreesWithTheirBlocks()
    rmSync(one, { recursive: true, force: true })
    expect(ports(other, 'prune').stdout).toContain(one)
    expect(claims(main)).toEqual(['2'])
    expect(ports(main, 'prune').stdout).toBe('Nothing to give up.\n')
  })

  test("a new worktree takes over a gone worktree's block without being asked to prune", () => {
    const main = repository()
    const one = worktree(main, 'one')
    portsOf(one)
    rmSync(one, { recursive: true, force: true })
    expect(portsOf(worktree(main, 'other'))).toEqual(block(1))
  })

  test('a file in the folder that is no claim is left alone', () => {
    const main = repository()
    const one = worktree(main, 'one')
    portsOf(one)
    writeFileSync(join(main, '.git', 'zenbu-ports', 'notes.txt'), 'kept')
    writeFileSync(join(main, '.git', 'zenbu-ports', '0'), 'kept')
    expect(ports(main, 'prune').stdout).toBe('Nothing to give up.\n')
    expect(claims(main)).toEqual(['0', '1', 'notes.txt'])
  })

  test('are one block when a worktree asks many times at once, and differ between worktrees', async () => {
    const main = repository()
    const names = ['a', 'b', 'c', 'd', 'e']
    const trees = names.map(name => worktree(main, name))
    const answers = await Promise.all([...trees, ...trees, ...trees, ...trees].map(asking))
    const saidIn = (tree: string) => [
      ...new Set(answers.filter(([folder]) => folder === tree).map(([, said]) => said))
    ]
    for (const tree of trees) expect(saidIn(tree)).toHaveLength(1)
    const firstBlocks = names.map((_, index) => JSON.stringify(block(index + 1)))
    expect(trees.map(tree => saidIn(tree)[0]).sort()).toEqual(firstBlocks)
    expect(claims(main)).toEqual(names.map((_, index) => String(index + 1)))
    for (const tree of trees) expect(JSON.stringify(portsOf(tree))).toBe(saidIn(tree)[0])
  })
})

describe('the lock a claim is made under', () => {
  const lockOf = (main: string) => join(main, '.git', 'zenbu-ports', 'lock')
  const thisRun = process.pid
  const aRunThatEnded = () => spawnSync(process.execPath, ['--eval', '']).pid

  function takenLongAgo(main: string, holder?: number) {
    mkdirSync(lockOf(main), { recursive: true })
    if (holder !== undefined) writeFileSync(join(lockOf(main), 'holder'), String(holder))
    const longAgo = new Date(Date.now() - 120_000)
    utimesSync(lockOf(main), longAgo, longAgo)
  }

  async function answerOfAWorktreeAskingUntilReleased(main: string) {
    let released = false
    const answer = asking(worktree(main, 'one')).then(([, said]) => ({
      said,
      afterRelease: released
    }))
    await new Promise(resolve => setTimeout(resolve, 400))
    released = true
    rmSync(lockOf(main), { recursive: true, force: true })
    return answer
  }

  const itsBlockOnceReleased = { said: JSON.stringify(block(1)), afterRelease: true }

  test('makes a worktree wait while another run holds it', async () => {
    const main = repository()
    mkdirSync(lockOf(main), { recursive: true })
    expect(await answerOfAWorktreeAskingUntilReleased(main)).toEqual(itsBlockOnceReleased)
    expect(claims(main)).toEqual(['1'])
  })

  test('is left with a run that is still going, however long ago it took it', async () => {
    const main = repository()
    takenLongAgo(main, thisRun)
    expect(await answerOfAWorktreeAskingUntilReleased(main)).toEqual(itsBlockOnceReleased)
    expect(claims(main)).toEqual(['1'])
  })

  test.each([
    ['named no run', undefined],
    ['named a run that has ended', aRunThatEnded()]
  ])('is taken over when it was taken long ago and %s', (_, holder) => {
    const main = repository()
    const one = worktree(main, 'one')
    takenLongAgo(main, holder)
    expect(portsOf(one)).toEqual(block(1))
    expect(claims(main)).toEqual(['1'])
  })

  test('is not needed by a worktree that already has its block', () => {
    const main = repository()
    const one = worktree(main, 'one')
    expect(portsOf(one)).toEqual(block(1))
    mkdirSync(lockOf(main))
    expect(portsOf(one)).toEqual(block(1))
  })

  test('a claim left half written by a run that died is cleared by the next claim', () => {
    const main = repository()
    const one = worktree(main, 'one')
    mkdirSync(join(main, '.git', 'zenbu-ports'), { recursive: true })
    writeFileSync(join(main, '.git', 'zenbu-ports', '1'), '')
    expect(portsOf(one)).toEqual(block(1))
    expect(claims(main)).toEqual(['1'])
  })
})

describe('a command run with a role', () => {
  const show = "process.stdout.write(`${process.env.PORT} ${process.argv.slice(1).join(' ')}`)"
  const node = process.execPath

  test("gets the role's port, in PORT and wherever an argument asks for it", () => {
    const one = worktree(repository(), 'one')
    const result = ports(one, 'run', 'preview', '--', node, '-e', show, '--', '--port', '@port')
    expect(result.stdout).toBe('21012 --port 21012')
    expect(result.status).toBe(0)
    expect(ports(one, 'run', 'site', '--', node, '-e', show).stdout).toBe('21010 ')
  })

  test('keeps a PORT the shell set', () => {
    const started = launch(21010, ['next', 'dev', '--port', '@port'], { PORT: '4000' }, {})
    expect(started).toEqual({
      program: 'next',
      arguments: ['dev', '--port', '4000'],
      env: { PORT: '4000' }
    })
    const one = worktree(repository(), 'one')
    const result = spawnSync(node, [script, 'run', 'site', '--', node, '-e', show], {
      cwd: one,
      encoding: 'utf8',
      env: environment({ PORT: '4000' })
    })
    expect(result.stdout).toBe('4000 ')
  })

  test("leaves PORT to the command's own settings file when the file sets it", () => {
    const one = worktree(repository(), 'one')
    const reading = ['--', node, '--env-file-if-exists=.env', '-e', show, '--', '@port']
    const run = () => ports(one, 'run', 'dictionary', '--settings', '.env', ...reading).stdout
    expect(run()).toBe('21013 21013')
    writeFileSync(join(one, '.env'), 'OTHER=kept\n')
    expect(run()).toBe('21013 21013')
    writeFileSync(join(one, '.env'), 'PORT=9001\nOTHER=kept\n')
    expect(run()).toBe('9001 9001')
  })

  test("ends with the command's own status", () => {
    const main = repository()
    expect(ports(main, 'run', 'site', '--', node, '-e', 'process.exit(7)').status).toBe(7)
    const absent = ports(main, 'run', 'site', '--', 'zenbu-no-such-command')
    expect(absent.status).toBe(127)
    expect(absent.stderr).toContain("zenbu-no-such-command didn't start")
  })

  test.each([
    ['an unknown role', ['run', 'mailbox', '--', 'node']],
    ['no command', ['run', 'site', '--']],
    ['a command with nothing to set it apart', ['run', 'site', 'node']],
    ['a settings file and no command', ['run', 'site', '--settings', '.env', '--']],
    ['a settings flag with no file', ['run', 'site', '--settings', '--', 'node']],
    ['another flag', ['run', 'site', '--env', '.env', '--', 'node']],
    ['an unknown command', ['show']],
    ['an argument too many', ['--json', 'site']]
  ])('refuses %s, with how to call it', (_, command) => {
    const result = ports(repository(), ...command)
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('Usage:')
    expect(result.stdout).toBe('')
  })
})

describe('the servers a checkout starts', () => {
  const launcher = 'node ../../tools/checks/ports.mjs run'

  test.each([
    ['apps/web', 'dev', `${launcher} site -- next dev`],
    ['apps/web', 'preview', `${launcher} preview -- opennextjs-cloudflare preview --port @port`],
    ['apps/dictionary-api', 'dev', `${launcher} dictionary --settings .env -- node `]
  ])('%s: pnpm %s takes its port from the script', (folder, name, command) => {
    const { scripts } = JSON.parse(readRepositoryFile(`${folder}/package.json`))
    expect(scripts[name]).toContain(command)
  })

  test('pnpm ports is the script', () => {
    const { scripts } = JSON.parse(readRepositoryFile('package.json'))
    expect(scripts.ports).toBe('node tools/checks/ports.mjs')
  })

  test.each([
    'apps/web/playwright.config.ts',
    'apps/web/vitest.config.ts',
    'apps/web/e2e/server.ts',
    'apps/web/src/test/gate.ts'
  ])('%s names no port of its own', file => {
    expect(readRepositoryFile(file)).not.toMatch(/localhost:\d|\b(3000|3100|8787|8788)\b/)
  })

  test("the website's browser tests and its gate ask the script, for the roles it has", () => {
    const helper = readRepositoryFile('apps/web/e2e/server.ts')
    expect(helper).toContain("'tools', 'checks', 'ports.mjs'), '--json'")
    for (const role of roles) expect(helper).toContain(`  ${role}: number`)
    expect(readRepositoryFile('apps/web/playwright.config.ts')).toContain('checkoutPorts()')
    expect(readRepositoryFile('apps/web/vitest.config.ts')).toContain('checkoutPorts().dictionary')
  })
})
