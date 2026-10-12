import { spawn, spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import {
  firstWorktreePort,
  lastSlot,
  launch,
  mainPorts,
  portsFor,
  portsPerWorktree,
  roles
} from '../ports.mjs'
import { readRepositoryFile } from './agents/workflow'
import { root } from './files'

const script = join(root, 'tools', 'checks', 'ports.mjs')
const folders: string[] = []
const scratch = () => {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), 'zenbu-ports-')))
  folders.push(folder)
  return folder
}

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

const git = (folder: string, ...command: string[]) =>
  spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...command], {
    cwd: folder
  })

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

const withoutPort = () => ({ ...process.env, PORT: undefined })
const ports = (folder: string, ...command: string[]) =>
  spawnSync(process.execPath, [script, ...command], {
    cwd: folder,
    encoding: 'utf8',
    env: withoutPort()
  })
const portsOf = (folder: string): Record<string, number> =>
  JSON.parse(ports(folder, '--json').stdout)
const block = (slot: number) => portsFor(slot)

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
      env: withoutPort()
    })
    child.stdout.on('data', chunk => {
      said += chunk
    })
    child.on('exit', () => done([folder, said.trim()]))
  })

describe('the ports of a checkout', () => {
  test('are the documented ones in the main checkout, which claims nothing', () => {
    const main = repository()
    expect(portsOf(main)).toEqual({ site: 3000, e2e: 3100, preview: 8787, dictionary: 8788 })
    expect(portsOf(join(main, '.git', '..'))).toEqual(mainPorts)
    expect(() => claims(main)).toThrow()
  })

  test('are the documented ones outside every repository', () => {
    expect(portsOf(scratch())).toEqual(mainPorts)
  })

  test("are a worktree's own block, the same each time it asks, from any folder in it", () => {
    const { main, one } = twoWorktreesWithTheirBlocks()
    expect(portsOf(one)).toEqual(block(1))
    expect(portsOf(join(one, '.git', '..'))).toEqual(block(1))
    expect(portsOf(main)).toEqual(mainPorts)
    expect(claims(main)).toEqual(['1', '2'])
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
    const byTree = new Map<string, Set<string>>()
    for (const [folder, said] of answers) {
      byTree.set(folder, (byTree.get(folder) ?? new Set()).add(said))
    }
    for (const said of byTree.values()) expect(said.size).toBe(1)
    const blocks = [...byTree.values()].map(said => [...said][0])
    expect(new Set(blocks).size).toBe(names.length)
    expect(claims(main)).toHaveLength(names.length)
    for (const folder of trees)
      expect(portsOf(folder)).toEqual(JSON.parse([...(byTree.get(folder) ?? [])][0]))
  })
})

describe('the lock a claim is made under', () => {
  const lockOf = (main: string) => join(main, '.git', 'zenbu-ports', 'lock')

  test('makes a worktree wait while another run holds it', async () => {
    const main = repository()
    const one = worktree(main, 'one')
    mkdirSync(lockOf(main), { recursive: true })
    let released = false
    const answer = asking(one).then(([, said]) => ({ said, afterRelease: released }))
    await new Promise(resolve => setTimeout(resolve, 400))
    released = true
    rmSync(lockOf(main), { recursive: true })
    expect(await answer).toEqual({ said: JSON.stringify(block(1)), afterRelease: true })
    expect(claims(main)).toEqual(['1'])
  })

  test('is taken over when the run that held it is long gone', () => {
    const main = repository()
    const one = worktree(main, 'one')
    mkdirSync(lockOf(main), { recursive: true })
    const longAgo = new Date(Date.now() - 120_000)
    utimesSync(lockOf(main), longAgo, longAgo)
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
      env: { ...process.env, PORT: '4000' }
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
