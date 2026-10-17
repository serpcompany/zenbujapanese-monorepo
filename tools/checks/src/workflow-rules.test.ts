import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { parse } from 'yaml'
import {
  readRepositoryFile,
  readWorkflow,
  type Step,
  workflowFiles,
  workflowSteps
} from './agents/workflow'
import { root } from './files'

const actionsFolder = '.github/actions'
const workflows = workflowFiles()
const actions = readdirSync(join(root, actionsFolder))
  .sort()
  .map(name => `${actionsFolder}/${name}/action.yml`)
const used = (path: string) =>
  [...readRepositoryFile(path).matchAll(/uses: (\S+)/g)].map(found => found[1])
const isLocal = (action: string) => action.startsWith('./')
const fileOf = (action: string) => `${action.slice(2)}/action.yml`
const actionSteps = (path: string): Step[] => parse(readRepositoryFile(path)).runs.steps
const stepsIn = (path: string) =>
  path.startsWith(actionsFolder) ? actionSteps(path) : workflowSteps(path)
const filterOf = (path: string) => {
  const step = workflowSteps(path).find(each => each.uses === './.github/actions/changed-paths')
  return step ? String(step.with?.paths ?? '').split(/\s+/) : undefined
}
const shipsOnPush = workflows.filter(path => /-(deploy|release|build)\.yml$/.test(path))
const versionFiles = [
  ['node-version-file', '.node-version'],
  ['python-version-file', '.python-version']
]
const byCommit = /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/
const pinsTable = readRepositoryFile('docs/agents/ci-deploys.md').split('\n')
const readsASecret = workflows.filter(path => readRepositoryFile(path).includes('secrets.'))

describe('every workflow', () => {
  test('is found, with the actions this repository defines', () => {
    expect(workflows.length).toBeGreaterThan(10)
    expect(actions).toContain(`${actionsFolder}/latest-run/action.yml`)
    expect(readsASecret).toContain('.github/workflows/web-deploy.yml')
    expect(shipsOnPush).toEqual([
      '.github/workflows/account-api-deploy.yml',
      '.github/workflows/dictionary-api-deploy.yml',
      '.github/workflows/language-data-build.yml',
      '.github/workflows/language-data-release.yml',
      '.github/workflows/web-deploy.yml'
    ])
  })

  test.each(workflows)('%s gives each job a time limit', path => {
    for (const [name, job] of Object.entries(readWorkflow(path).jobs)) {
      expect(job['timeout-minutes'], `${path}: ${name}`).toBeGreaterThan(0)
    }
  })

  test.each([...workflows, ...actions])('%s takes its Node version from .node-version', path => {
    expect(readRepositoryFile(path)).not.toMatch(/node-version:/)
    for (const step of stepsIn(path).filter(each => each.uses?.startsWith('actions/setup-node@'))) {
      expect(step.with?.['node-version-file'], path).toBe('.node-version')
    }
  })

  test('.node-version names one version', () => {
    expect(readRepositoryFile('.node-version')).toMatch(/^\d+(\.\d+){0,2}\n$/)
  })

  test.each([
    ...workflows,
    ...actions
  ])('%s takes its Python version from .python-version', path => {
    expect(readRepositoryFile(path)).not.toMatch(/python-version:/)
    for (const step of stepsIn(path).filter(each =>
      each.uses?.startsWith('actions/setup-python@')
    )) {
      expect(step.with?.['python-version-file'], path).toBe('.python-version')
    }
  })

  test.each(
    workflows
  )("%s takes main's version file where a job checks out a ref of its own choosing", path => {
    for (const [name, job] of Object.entries(readWorkflow(path).jobs)) {
      const steps = job.steps ?? []
      const checkout = steps.findIndex(
        step => step.uses?.startsWith('actions/checkout@') && step.with?.ref !== undefined
      )
      if (checkout === -1) continue
      for (const [key, file] of versionFiles) {
        const setUp = steps.findIndex(step => step.with?.[key] === file)
        if (setUp === -1) continue
        const fallback = steps.findIndex(step => step.if?.includes(`hashFiles('${file}') == ''`))
        expect(fallback, `${path}: ${name}`).toBeGreaterThan(checkout)
        expect(fallback, `${path}: ${name}`).toBeLessThan(setUp)
      }
    }
  })

  test.each(
    workflows.filter(path => filterOf(path) !== undefined)
  )('%s works again when a version file it reads changes', path => {
    const text = [path, ...used(path).filter(isLocal).map(fileOf)]
      .map(readRepositoryFile)
      .join('\n')
    const filter = filterOf(path) ?? []
    for (const [reads, file] of [
      ['node-version-file', '.node-version'],
      ['python-version-file', '.python-version'],
      ['.xcode-version', '.xcode-version']
    ]) {
      if (text.includes(reads)) expect(filter, `${path}: ${file}`).toContain(file)
    }
  })

  test.each(shipsOnPush)('%s starts on a push that changes a version file it builds with', path => {
    const push = readWorkflow(path).on.push as { paths?: string[] } | undefined
    const text = [path, ...used(path).filter(isLocal).map(fileOf)]
      .map(readRepositoryFile)
      .join('\n')
    for (const [key, file] of versionFiles) {
      if (text.includes(key)) expect(push?.paths, `${path}: ${file}`).toContain(file)
    }
  })

  test.each([
    'web',
    'dictionary-api',
    'account-api'
  ])("%s works again when the script that hands out the site's ports changes", name => {
    expect(filterOf(`.github/workflows/${name}.yml`)).toContain('tools/checks/ports.mjs')
  })

  test('every workflow that starts Postgres starts the same one', () => {
    const images = workflows.flatMap(path =>
      [...readRepositoryFile(path).matchAll(/image: (postgres:\S+)/g)].map(found => found[1])
    )
    expect(images.length).toBeGreaterThan(1)
    expect(new Set(images).size).toBe(1)
  })

  test.each(
    readsASecret
  )('%s reads a secret, so every action it runs is at a pinned commit', path => {
    const reached = used(path).flatMap(action =>
      isLocal(action) ? used(fileOf(action)) : [action]
    )
    expect(reached.length, path).toBeGreaterThan(0)
    for (const action of reached) expect(action, path).toMatch(byCommit)
  })

  test('each pinned commit is in the table of pinned actions, beside the file that uses it', () => {
    for (const path of [...workflows, ...actions]) {
      for (const action of used(path).filter(each => byCommit.test(each))) {
        const [name, commit] = action.split('@')
        const row = pinsTable.find(line => line.startsWith(`| \`${name}\` | \`${commit}\` |`))
        expect(row, `${action} in ${path}`).toBeDefined()
        expect(row, `${action} in ${path}`).toContain(`\`${path}\``)
      }
    }
  })

  test('the table of pinned actions names no commit that nothing uses', () => {
    const inUse = new Set([...workflows, ...actions].flatMap(used))
    const rows = pinsTable.flatMap(line => {
      const found = /^\| `([\w./-]+)` \| `([0-9a-f]{40})` \|/.exec(line)
      return found ? [`${found[1]}@${found[2]}`] : []
    })
    expect(rows.length).toBeGreaterThan(5)
    for (const row of rows) expect(inUse, row).toContain(row)
  })
})

describe('the version each toolchain is pinned to', () => {
  const node = readRepositoryFile('.node-version').trim().split('.')[0]
  const python = readRepositoryFile('.python-version').trim()
  const packages = [
    'package.json',
    'apps/web/package.json',
    'apps/dictionary-api/package.json',
    'apps/account-api/package.json',
    'packages/dictionary-core/package.json',
    'packages/node-service/package.json',
    'tools/checks/package.json'
  ]

  test('.python-version names the Python Ruff targets and the pipeline pins were compiled for', () => {
    expect(python).toMatch(/^\d+\.\d+$/)
    expect(readRepositoryFile('ruff.toml')).toContain(
      `target-version = "py${python.replace('.', '')}"`
    )
    expect(readRepositoryFile('language-data/README.md')).toContain(`--python-version ${python} `)
  })

  test.each([
    'apps/dictionary-api/Dockerfile',
    'apps/account-api/Dockerfile'
  ])('%s runs a release of the Node .node-version names', path => {
    expect(/^ARG NODE_IMAGE=node:(\d+)\./m.exec(readRepositoryFile(path))?.[1]).toBe(node)
  })

  test.each(packages)('%s asks for that Node or a later release of it', path => {
    expect(JSON.parse(readRepositoryFile(path)).engines.node).toMatch(new RegExp(`^>=${node}\\.`))
  })
})
