import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  answerTo,
  commandToRun,
  firstWorktreePort,
  lastSlot,
  launch,
  mainPorts,
  portsFor,
  portsPerWorktree,
  roles
} from '../ports.mjs'
import { aWorld, claims, packageFolder, type World } from './agents/ports-world'
import { git, outsideGit, scratchFolder } from './agents/scratch'
import { readRepositoryFile } from './agents/workflow'
import { root } from './files'

const block = (slot: number) => portsFor(slot)

function twoWorktreesWithTheirBlocks(world: World) {
  const main = world.repository()
  const one = world.worktree(main, 'one')
  const other = world.worktree(main, 'other')
  expect(world.portsOf(one)).toEqual(block(1))
  expect(world.portsOf(other)).toEqual(block(2))
  return { main, one, other }
}

describe('the ports of a checkout', () => {
  test('are the documented ones in the main checkout, which claims nothing', () => {
    const world = aWorld()
    const main = world.repository()
    expect(world.portsOf(main)).toEqual({ site: 3000, e2e: 3100, preview: 8787, dictionary: 8788 })
    expect(world.portsOf(packageFolder(main))).toEqual(mainPorts)
    expect(() => claims(main)).toThrow()
  })

  test('are the documented ones outside every repository', () => {
    expect(aWorld().portsOf(scratchFolder('ports'))).toEqual(mainPorts)
  })

  test("are a worktree's own block, the same each time it asks, from any folder in it", () => {
    const world = aWorld()
    const { main, one } = twoWorktreesWithTheirBlocks(world)
    expect(world.portsOf(one)).toEqual(block(1))
    expect(world.portsOf(packageFolder(one))).toEqual(block(1))
    expect(world.portsOf(main)).toEqual(mainPorts)
    expect(claims(main)).toEqual(['1', '2'])
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
    const world = aWorld()
    const one = world.worktree(world.repository(), 'one')
    expect(world.ask([], one)).toBe(
      [
        'site       http://localhost:21010',
        'e2e        http://localhost:21011',
        'preview    http://localhost:21012',
        'dictionary http://localhost:21013'
      ].join('\n')
    )
  })

  test('are given up by delete, and the next worktree takes the block', () => {
    const world = aWorld()
    const { main, one, other } = twoWorktreesWithTheirBlocks(world)
    expect(world.ask(['delete'], one)).toContain('Gave up http://localhost:21010 and its block')
    expect(claims(main)).toEqual(['2'])
    expect(world.ask(['delete'], one)).toBe('Nothing to give up.')
    expect(world.portsOf(world.worktree(main, 'third'))).toEqual(block(1))
    expect(world.portsOf(other)).toEqual(block(2))
    expect(world.ask(['delete'], main)).toContain('This checkout uses the main ports')
  })

  test("prune gives up a block whose worktree's folder is gone, and no other", () => {
    const world = aWorld()
    const { main, one, other } = twoWorktreesWithTheirBlocks(world)
    rmSync(one, { recursive: true, force: true })
    expect(world.ask(['prune'], other)).toContain(one)
    expect(claims(main)).toEqual(['2'])
    expect(world.ask(['prune'], main)).toBe('Nothing to give up.')
  })

  test("a new worktree takes over a gone worktree's block without being asked to prune", () => {
    const world = aWorld()
    const main = world.repository()
    const one = world.worktree(main, 'one')
    world.portsOf(one)
    rmSync(one, { recursive: true, force: true })
    expect(world.portsOf(world.worktree(main, 'other'))).toEqual(block(1))
  })

  test('a file in the folder that is no claim is left alone', () => {
    const world = aWorld()
    const main = world.repository()
    world.portsOf(world.worktree(main, 'one'))
    writeFileSync(join(main, '.git', 'zenbu-ports', 'notes.txt'), 'kept')
    writeFileSync(join(main, '.git', 'zenbu-ports', '0'), 'kept')
    expect(world.ask(['prune'], main)).toBe('Nothing to give up.')
    expect(claims(main)).toEqual(['0', '1', 'notes.txt'])
  })

  test.each<[string, string, Record<string, number>, Record<string, number>, string[]]>([
    ['the same worktree', 'one', block(1), block(1), ['1']],
    ['another worktree', 'other', block(2), block(1), ['1', '2']]
  ])('are one block per worktree when a first asker waits at the lock while one from %s claims', (_, second, waiterGets, secondGets, claimed) => {
    const world = aWorld()
    const main = world.repository()
    const one = world.worktree(main, 'one')
    const secondFolder = world.worktree(main, second)
    world.holdLock(main, { holder: world.aRunStillGoing() })
    let secondAnswer: Record<string, number> = {}
    world.meanwhile(0, () => {
      world.releaseLock(main)
      secondAnswer = world.portsOf(secondFolder)
    })
    expect(world.portsOf(one)).toEqual(waiterGets)
    expect(secondAnswer).toEqual(secondGets)
    expect(claims(main)).toEqual(claimed)
  })
})

describe('the lock a claim is made under', () => {
  const askingWorktree = (world: World) => {
    const main = world.repository()
    return { main, one: world.worktree(main, 'one') }
  }

  test('makes a worktree wait while another run holds it', () => {
    const world = aWorld()
    const { main, one } = askingWorktree(world)
    world.holdLock(main)
    world.meanwhile(1_000, () => world.releaseLock(main))
    expect(world.portsOf(one)).toEqual(block(1))
    expect(world.secondsWaited()).toBe(1)
    expect(claims(main)).toEqual(['1'])
  })

  test('is left with a run that is still going, however long ago it took it', () => {
    const world = aWorld()
    const { main, one } = askingWorktree(world)
    world.holdLock(main, { holder: world.aRunStillGoing(), secondsAgo: 120 })
    world.meanwhile(20_000, () => world.releaseLock(main))
    expect(world.portsOf(one)).toEqual(block(1))
    expect(world.secondsWaited()).toBe(20)
    expect(claims(main)).toEqual(['1'])
  })

  test.each<[string, (world: World) => number | undefined]>([
    ['named no run', () => undefined],
    ['named a run that has ended', world => world.aRunThatEnded()]
  ])('is taken over at once when it was taken long ago and %s', (_, holder) => {
    const world = aWorld()
    const { main, one } = askingWorktree(world)
    world.holdLock(main, { holder: holder(world), secondsAgo: 120 })
    expect(world.portsOf(one)).toEqual(block(1))
    expect(world.secondsWaited()).toBe(0)
    expect(claims(main)).toEqual(['1'])
  })

  test('is taken over ten seconds after a run took it without naming itself', () => {
    const world = aWorld()
    const { main, one } = askingWorktree(world)
    world.holdLock(main)
    expect(world.portsOf(one)).toEqual(block(1))
    expect(world.secondsWaited()).toBe(10)
  })

  test('is waited for 30 seconds while a run that is still going holds it, then left to be removed', () => {
    const world = aWorld()
    const { main, one } = askingWorktree(world)
    world.holdLock(main, { holder: world.aRunStillGoing() })
    expect(() => world.portsOf(one)).toThrow(/has held .*lock for 30 seconds\. Remove it\./)
    expect(world.secondsWaited()).toBe(30)
    expect(claims(main)).toEqual(['lock'])
  })

  test('is not needed by a worktree that already has its block', () => {
    const world = aWorld()
    const { main, one } = askingWorktree(world)
    expect(world.portsOf(one)).toEqual(block(1))
    world.holdLock(main, { holder: world.aRunStillGoing() })
    expect(world.portsOf(one)).toEqual(block(1))
    expect(world.secondsWaited()).toBe(0)
  })

  test('a claim left half written by a run that died is cleared by the next claim', () => {
    const world = aWorld()
    const { main, one } = askingWorktree(world)
    mkdirSync(join(main, '.git', 'zenbu-ports'))
    writeFileSync(join(main, '.git', 'zenbu-ports', '1'), '')
    expect(world.portsOf(one)).toEqual(block(1))
    expect(claims(main)).toEqual(['1'])
  })
})

describe('a command run with a role', () => {
  const inWorktree = () => {
    const world = aWorld()
    return { world, one: world.worktree(world.repository(), 'one') }
  }

  test("gets the role's port, in PORT and wherever an argument asks for it", () => {
    const { world, one } = inWorktree()
    const run = (command: string[]) => commandToRun(command, one, {}, world.asker())
    expect(run(['preview', '--', 'serve', '--', '--port', '@port'])).toEqual({
      program: 'serve',
      arguments: ['--', '--port', '21012'],
      env: { PORT: '21012' }
    })
    expect(run(['site', '--', 'next', 'dev'])?.env).toEqual({ PORT: '21010' })
  })

  test('keeps a PORT the shell set', () => {
    const started = launch(21010, ['next', 'dev', '--port', '@port'], { PORT: '4000' }, {})
    expect(started).toEqual({
      program: 'next',
      arguments: ['dev', '--port', '4000'],
      env: { PORT: '4000' }
    })
    const { world, one } = inWorktree()
    expect(
      commandToRun(['site', '--', 'next', 'dev'], one, { PORT: '4000' }, world.asker())
    ).toEqual({ program: 'next', arguments: ['dev'], env: { PORT: '4000' } })
  })

  test("leaves PORT to the command's own settings file when the file sets it", () => {
    const { world, one } = inWorktree()
    const reading = ['dictionary', '--settings', '.env', '--', 'node', 'server.js', '@port']
    const run = () => commandToRun(reading, one, {}, world.asker())
    const itsOwn = { program: 'node', arguments: ['server.js', '21013'], env: { PORT: '21013' } }
    expect(run()).toEqual(itsOwn)
    writeFileSync(join(one, '.env'), 'OTHER=kept\n')
    expect(run()).toEqual(itsOwn)
    writeFileSync(join(one, '.env'), 'PORT=9001\nOTHER=kept\n')
    expect(run()).toEqual({ program: 'node', arguments: ['server.js', '9001'], env: {} })
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
  ])('refuses %s', (_, [command, ...rest]) => {
    const world = aWorld()
    const folder = world.repository()
    const answer =
      command === 'run'
        ? commandToRun(rest, folder, {}, world.asker())
        : answerTo([command, ...rest], folder, world.asker())
    expect(answer).toBeUndefined()
  })
})

describe('the script, run as a command', () => {
  const script = join(root, 'tools', 'checks', 'ports.mjs')
  const node = process.execPath
  const environment = (changes: Record<string, string> = {}) =>
    outsideGit({ PORT: undefined, ...changes })
  const ports = (folder: string, command: string[], env = environment()) =>
    spawnSync(node, [script, ...command], { cwd: folder, encoding: 'utf8', env })

  const repository = () => {
    const folder = scratchFolder('ports')
    git(folder, 'init', '--quiet')
    return folder
  }

  test('prints the documented ports of a main checkout as git describes it, and claims nothing', () => {
    const main = repository()
    expect(JSON.parse(ports(main, ['--json']).stdout)).toEqual(mainPorts)
    expect(() => claims(main)).toThrow()
  })

  test("prints a worktree's own block when git has named another folder, as it does for a hook", () => {
    const main = repository()
    git(main, 'commit', '--quiet', '--allow-empty', '--message', 'Start')
    const one = join(main, '.claude', 'worktrees', 'one')
    expect(git(main, 'worktree', 'add', '--quiet', '--detach', one).status).toBe(0)
    const hook = environment({ GIT_DIR: join(main, '.git', 'worktrees', 'one') })
    expect(JSON.parse(ports(packageFolder(one), ['--json'], hook).stdout)).toEqual(block(1))
    expect(claims(main)).toEqual(['1'])
    expect(readFileSync(join(main, '.git', 'zenbu-ports', '1'), 'utf8')).toBe(`${one}\n`)
  })

  test("runs the command with the role's port, and ends with the command's status", () => {
    const show = "process.stdout.write(`${process.env.PORT} ${process.argv.slice(1).join(' ')}`)"
    const command = [node, '-e', `${show}; process.exitCode = 7`, '--', '@port']
    const ran = ports(scratchFolder('ports'), ['run', 'preview', '--', ...command])
    expect(ran.stdout).toBe('8787 8787')
    expect(ran.status).toBe(7)
  })

  test("ends with 127 when the command can't start", () => {
    const absent = ports(scratchFolder('ports'), ['run', 'site', '--', 'zenbu-no-such-command'])
    expect(absent.status).toBe(127)
    expect(absent.stderr).toContain("zenbu-no-such-command didn't start")
  })

  test('refuses a command it has no use for with how to call it', () => {
    const refused = ports(scratchFolder('ports'), ['run', 'mailbox', '--', 'node'])
    expect(refused.status).toBe(2)
    expect(refused.stderr).toContain('Usage:')
    expect(refused.stdout).toBe('')
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
