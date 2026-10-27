import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { parse } from 'yaml'
import { outsideGit, scratchFolder } from './agents/scratch'
import { readRepositoryFile } from './agents/workflow'
import { root } from './files'

interface HookCommand {
  run: string
  skip?: { run: string }[]
}

interface Package {
  folder: string
  name: string
  scripts: Record<string, string>
  uses: string[]
}

const hookFile = 'lefthook.yml'
const sharedHookFile = 'node_modules/@serpcompany/verify/configs/lefthook.yml'
const lefthook = join(root, 'node_modules', 'lefthook', 'bin', 'index.js')
const staticChecks = '--silent exec serp-verify'
const rootPackageFiles = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']
const unchangedOnTheBranch = /^git diff --quiet origin\/main\.\.\.HEAD -- (.+)$/
const pnpmThatRecordsItsCalls = [
  '#!/bin/sh',
  'echo "$*" >>"$PNPM_CALLS"',
  'case "$*" in *"${PNPM_FAILS:-no such call}"*) exit 1 ;; esac',
  ''
].join('\n')

const prePush = (
  parse(readRepositoryFile(hookFile)) as Record<string, { commands: Record<string, HookCommand> }>
)['pre-push'].commands

function workspacePackages(): Package[] {
  const { packages } = parse(readRepositoryFile('pnpm-workspace.yaml')) as { packages: string[] }
  const folders = packages
    .flatMap(pattern =>
      pattern.endsWith('/*')
        ? readdirSync(join(root, dirname(pattern))).map(name => `${dirname(pattern)}/${name}`)
        : [pattern]
    )
    .filter(folder => existsSync(join(root, folder, 'package.json')))
  const manifests = folders.map(folder => ({
    folder,
    ...(JSON.parse(readRepositoryFile(`${folder}/package.json`)) as {
      name: string
      scripts: Record<string, string>
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    })
  }))
  const folderOf = new Map(manifests.map(({ name, folder }) => [name, folder]))
  return manifests.map(({ folder, name, scripts, dependencies, devDependencies }) => ({
    folder,
    name,
    scripts,
    uses: Object.entries({ ...dependencies, ...devDependencies })
      .filter(([, version]) => version.startsWith('workspace:'))
      .flatMap(([dependency]) => folderOf.get(dependency) ?? [])
  }))
}

const packages = workspacePackages()
const ofPackage = (each: Package) => `--silent --filter ${each.name} `
const commandOf = (each: Package) =>
  Object.values(prePush).find(command => command.run.includes(ofPackage(each)))
const callsOf = (each: Package) =>
  (commandOf(each)?.run ?? '')
    .split(' && ')
    .map(step => step.replace(/^pnpm /, '').replaceAll('"', ''))
const callsFor = (changed: string) =>
  [
    staticChecks,
    ...packages
      .filter(each => each.folder === changed || each.uses.includes(changed))
      .flatMap(callsOf)
  ].sort()
const everyCall = [staticChecks, ...packages.flatMap(callsOf)].sort()

function written(script: string, scripts: Record<string, string>): string {
  return (scripts[script] ?? script).replace(/pnpm ([\w:-]+)/g, (whole, name: string) =>
    name in scripts ? written(name, scripts) : whole
  )
}

let ownGitConfig: string

beforeEach(() => {
  ownGitConfig = join(scratchFolder('git-config'), 'gitconfig')
  writeFileSync(ownGitConfig, '[user]\n\tname = Test\n\temail = test@example.com\n')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

const ownGit = (changes: Record<string, string | undefined> = {}) =>
  outsideGit({ GIT_CONFIG_GLOBAL: ownGitConfig, GIT_CONFIG_NOSYSTEM: '1', ...changes })

function machineConfigIgnoring(pattern: string): string {
  const folder = scratchFolder('machine-git-config')
  writeFileSync(join(folder, 'excludes'), `${pattern}\n`)
  writeFileSync(join(folder, 'gitconfig'), `[core]\n\texcludesFile = ${join(folder, 'excludes')}\n`)
  return join(folder, 'gitconfig')
}

function git(folder: string, ...command: string[]): void {
  const result = spawnSync('git', command, { cwd: folder, encoding: 'utf8', env: ownGit() })
  expect(result.status, `git ${command.join(' ')}: ${result.stderr}`).toBe(0)
}

function commit(checkout: string, ...paths: string[]): void {
  for (const path of paths) {
    mkdirSync(dirname(join(checkout, path)), { recursive: true })
    writeFileSync(join(checkout, path), `${path} at ${paths.length}\n`, { flag: 'a' })
  }
  git(checkout, 'add', '--all')
  git(checkout, 'commit', '--quiet', '--message', `Change ${paths.join(', ')}`)
}

function branch(): { origin: string; checkout: string } {
  const origin = scratchFolder('push-origin')
  const checkout = scratchFolder('push-clone')
  git(origin, 'init', '--quiet', '--initial-branch=main')
  writeFileSync(join(origin, hookFile), readRepositoryFile(hookFile))
  mkdirSync(dirname(join(origin, sharedHookFile)), { recursive: true })
  writeFileSync(join(origin, sharedHookFile), readRepositoryFile(sharedHookFile))
  commit(origin, 'README.md')
  git(checkout, 'clone', '--quiet', `file://${origin}`, '.')
  git(checkout, 'switch', '--quiet', '--create', 'work')
  return { origin, checkout }
}

function push(checkout: string, failing = ''): { status: number | null; calls: string[] } {
  const tools = scratchFolder('push-tools')
  const calls = join(tools, 'calls.txt')
  writeFileSync(calls, '')
  writeFileSync(join(tools, 'pnpm'), pnpmThatRecordsItsCalls, { mode: 0o755 })
  const result = spawnSync(process.execPath, [lefthook, 'run', 'pre-push'], {
    cwd: checkout,
    encoding: 'utf8',
    env: ownGit({
      PATH: `${tools}:${process.env.PATH ?? ''}`,
      PNPM_CALLS: calls,
      PNPM_FAILS: failing,
      LEFTHOOK: undefined
    })
  })
  return {
    status: result.status,
    calls: readFileSync(calls, 'utf8').split('\n').filter(Boolean).sort()
  }
}

describe('the pre-push hook', () => {
  test("runs the shared checks from @serpcompany/verify's own hooks", () => {
    expect(parse(readRepositoryFile(hookFile)).extends).toEqual([sharedHookFile])
    expect(Object.keys(prePush)).not.toContain('verify')
  })

  test('finds every package of the workspace', () => {
    expect(packages.map(each => each.name)).toEqual(
      expect.arrayContaining([
        'zenbujapanese-web',
        '@zenbu/dictionary-core',
        'zenbujapanese-checks'
      ])
    )
    expect(packages.length).toBeGreaterThan(5)
  })

  test.each(
    packages.map(each => [each.name, each] as const)
  )("asks git whether the branch changed %s, a package it imports, or the root's package files", (_, each) => {
    const asked = commandOf(each)?.skip?.map(condition => condition.run) ?? []
    expect(asked).toHaveLength(1)
    const paths = unchangedOnTheBranch.exec(asked[0])?.[1].split(' ') ?? []
    expect(paths).toEqual(expect.arrayContaining([each.folder, ...each.uses, ...rootPackageFiles]))
  })

  test.each(
    packages.map(each => [each.name, each] as const)
  )("runs %s's lint, types, and unit tests, with no build and no browser", (_, each) => {
    const calls = callsOf(each)
    for (const call of calls) expect(call.startsWith(ofPackage(each)), call).toBe(true)
    const runs = calls
      .map(call => call.slice(ofPackage(each).length).split(' '))
      .map(([script, ...options]) => [written(script, each.scripts), ...options].join(' '))
      .join(' && ')
    for (const part of ['biome check', 'tsc --noEmit', 'vitest run']) expect(runs).toContain(part)
    expect(runs).not.toMatch(/\bbuild\b|playwright/)
  })

  test("leaves the dictionary service's recorded suites to its whole check", () => {
    const service = packages.find(each => each.folder === 'apps/dictionary-api')
    expect(service && callsOf(service).at(-1)).toBe(
      '--silent --filter zenbujapanese-dictionary-api test --exclude src/conformance/**'
    )
  })

  test('runs only the static checks when the branch changes only docs', () => {
    const { checkout } = branch()
    commit(checkout, 'docs/agents/ci.md', 'apps/ios/App/ZenbuJapaneseApp.swift')
    expect(push(checkout)).toEqual({ status: 0, calls: [staticChecks] })
  })

  test.each([
    'GIT_CONFIG_GLOBAL',
    'GIT_CONFIG_SYSTEM'
  ])("ignores the machine's git config at %s, such as an excludes file that ignores node_modules/", config => {
    vi.stubEnv(config, machineConfigIgnoring('node_modules/'))
    const { checkout } = branch()
    commit(checkout, 'docs/agents/ci.md')
    expect(push(checkout)).toEqual({ status: 0, calls: [staticChecks] })
  })

  test.each(
    packages.map(each => each.folder)
  )('runs the fast check of each package a change under %s reaches', folder => {
    const { checkout } = branch()
    commit(checkout, `${folder}/src/changed.ts`)
    expect(push(checkout)).toEqual({ status: 0, calls: callsFor(folder) })
  })

  test("runs every package's fast check when the branch changes the lockfile", () => {
    const { checkout } = branch()
    commit(checkout, 'pnpm-lock.yaml')
    expect(push(checkout).calls).toEqual(everyCall)
  })

  test("runs the checks' own tests when the branch changes a workflow", () => {
    const { checkout } = branch()
    commit(checkout, '.github/workflows/web.yml')
    expect(push(checkout).calls).toEqual(callsFor('tools/checks'))
  })

  test('checks the whole branch against origin/main, not only the commits of this push', () => {
    const { checkout } = branch()
    commit(checkout, 'apps/web/src/changed.ts')
    git(checkout, 'push', '--quiet', '--no-verify', '--set-upstream', 'origin', 'work')
    commit(checkout, 'docs/agents/ci.md')
    expect(push(checkout).calls).toEqual(callsFor('apps/web'))
  })

  test('leaves alone a package only main changed since the branch began', () => {
    const { origin, checkout } = branch()
    commit(origin, 'apps/web/src/changed.ts')
    git(checkout, 'fetch', '--quiet', 'origin')
    commit(checkout, 'docs/agents/ci.md')
    expect(push(checkout).calls).toEqual([staticChecks])
  })

  test("stops the push, and the package's later steps, when one step fails", () => {
    const { checkout } = branch()
    commit(checkout, 'apps/web/src/changed.ts')
    const pushed = push(checkout, 'zenbujapanese-web typecheck')
    expect(pushed.calls).toEqual(callsFor('apps/web').filter(call => !call.endsWith(' test')))
    expect(pushed.status).not.toBe(0)
  })

  test('runs every fast check where it cannot tell what the branch changed', () => {
    const { checkout } = branch()
    commit(checkout, 'docs/agents/ci.md')
    git(checkout, 'update-ref', '-d', 'refs/remotes/origin/main')
    expect(push(checkout).calls).toEqual(everyCall)
  })
})
