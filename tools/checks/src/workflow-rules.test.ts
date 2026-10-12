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
const byCommit = /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/
const pinsTable = readRepositoryFile('docs/agents/ci-deploys.md').split('\n')
const readsASecret = workflows.filter(path => readRepositoryFile(path).includes('secrets.'))

describe('every workflow', () => {
  test('is found, with the actions this repository defines', () => {
    expect(workflows.length).toBeGreaterThan(10)
    expect(actions).toContain(`${actionsFolder}/latest-run/action.yml`)
    expect(readsASecret).toContain('.github/workflows/web-deploy.yml')
  })

  test.each(workflows)('%s gives each job a time limit', path => {
    for (const [name, job] of Object.entries(readWorkflow(path).jobs)) {
      expect(job['timeout-minutes'], `${path}: ${name}`).toBeGreaterThan(0)
    }
  })

  test.each([...workflows, ...actions])('%s takes its Node version from .node-version', path => {
    expect(readRepositoryFile(path)).not.toMatch(/node-version:/)
    const steps = path.startsWith(actionsFolder) ? actionSteps(path) : workflowSteps(path)
    for (const step of steps.filter(each => each.uses?.startsWith('actions/setup-node@'))) {
      expect(step.with?.['node-version-file'], path).toBe('.node-version')
    }
  })

  test('.node-version names one version', () => {
    expect(readRepositoryFile('.node-version')).toMatch(/^\d+(\.\d+){0,2}\n$/)
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
