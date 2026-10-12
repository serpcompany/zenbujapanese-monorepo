import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { parse } from 'yaml'
import { readRepositoryFile, readWorkflow } from './agents/workflow'

const gated = [
  ['web', ['check', 'e2e']],
  ['dictionary-core', ['check']],
  ['dictionary-api', ['scripts', 'check']],
  ['account-api', ['check', 'website']],
  ['ios', ['contracts', 'swift']],
  ['language-data-build', ['build']]
] as const

const requirable = [...gated.map(([name]) => name), 'repository', 'pull-request']

describe('the workflows a merge can be made to wait for', () => {
  test.each(requirable)('%s starts on every pull request and in the merge queue', name => {
    const workflow = readWorkflow(`.github/workflows/${name}.yml`)
    expect(Object.keys(workflow.on)).toEqual(
      expect.arrayContaining(['pull_request', 'merge_group'])
    )
    const trigger = workflow.on.pull_request as { paths?: string[] } | null
    expect(trigger?.paths).toBeUndefined()
  })

  test.each(requirable)('%s never cancels a run in the merge queue', name => {
    const cancel = readWorkflow(`.github/workflows/${name}.yml`).concurrency?.['cancel-in-progress']
    expect(typeof cancel).toBe('string')
    expect(cancel).toMatch(/github\.event_name (== 'pull_request'|!= 'merge_group')/)
  })

  test.each(
    gated
  )('%s decides inside what to run, and ends in one job that always reports', (name, jobs) => {
    const workflow = readWorkflow(`.github/workflows/${name}.yml`)
    expect(Object.keys(workflow.jobs)).toEqual(['changes', ...jobs, name])
    const paths = workflow.jobs.changes.steps?.find(step => step.id === 'paths')
    expect(paths?.uses).toBe('./.github/actions/changed-paths')
    expect(String(paths?.with?.paths).split(/\s+/)).toEqual(
      expect.arrayContaining([`.github/workflows/${name}.yml`, '.github/actions/changed-paths'])
    )
    for (const job of jobs) {
      expect(workflow.jobs[job].needs).toBe('changes')
      expect(workflow.jobs[job].if).toContain("needs.changes.outputs.changed == 'true'")
    }
    const gate = workflow.jobs[name]
    expect(gate.if).toBe('always()')
    expect(gate.needs).toEqual(['changes', ...jobs])
    expect(gate.steps).toEqual([
      {
        name: 'Every job passed, or had nothing to check',
        if: "contains(needs.*.result, 'failure') || contains(needs.*.result, 'cancelled')",
        run: 'exit 1'
      }
    ])
  })

  test('the pull request rules pass in the merge queue without running', () => {
    const workflow = readWorkflow('.github/workflows/pull-request.yml')
    expect(Object.keys(workflow.jobs)).toEqual(['title', 'issue-link', 'fix-test'])
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps ?? [])
        expect(step.if).toBe("github.event_name == 'pull_request'")
      const runs = (job.steps ?? []).map(step => step.run ?? '').join('\n')
      expect(runs).not.toContain('${{')
    }
  })
})

describe('the changed-paths action', () => {
  const folders: string[] = []
  afterEach(() => {
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
  })

  const action = parse(readRepositoryFile('.github/actions/changed-paths/action.yml')) as {
    runs: { steps: { run: string }[] }
  }
  const git = (cwd: string, ...args: string[]) =>
    spawnSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args], {
      cwd,
      encoding: 'utf8'
    }).stdout.trim()

  function clone(): { checkout: string; base: string } {
    const origin = realpathSync(mkdtempSync(join(tmpdir(), 'zenbu-paths-origin-')))
    const checkout = realpathSync(mkdtempSync(join(tmpdir(), 'zenbu-paths-clone-')))
    folders.push(origin, checkout)
    git(origin, 'init', '--quiet', '--initial-branch=main')
    writeFileSync(join(origin, 'web.txt'), 'one\n')
    writeFileSync(join(origin, 'app.txt'), 'one\n')
    git(origin, 'add', '.')
    git(origin, 'commit', '--quiet', '-m', 'base')
    const base = git(origin, 'rev-parse', 'HEAD')
    writeFileSync(join(origin, 'web.txt'), 'two\n')
    git(origin, 'commit', '--quiet', '-am', 'head')
    git(checkout, 'clone', '--quiet', '--depth=1', `file://${origin}`, '.')
    return { checkout, base }
  }

  function changed(checkout: string, base: string, paths: string): string {
    const output = join(checkout, 'output.txt')
    writeFileSync(output, '')
    const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', action.runs.steps[0].run], {
      cwd: checkout,
      env: { PATH: process.env.PATH ?? '', BASE: base, PATHS: paths, GITHUB_OUTPUT: output },
      encoding: 'utf8'
    })
    expect(result.status, result.stderr).toBe(0)
    return readFileSync(output, 'utf8').trim()
  }

  test('says a change under one of the paths changed them', () => {
    const { checkout, base } = clone()
    expect(changed(checkout, base, 'docs web.txt')).toBe('changed=true')
  })

  test('says a change elsewhere left them alone', () => {
    const { checkout, base } = clone()
    expect(changed(checkout, base, 'app.txt docs')).toBe('changed=false')
  })

  test('reads paths written one to a line as well as on one line', () => {
    const { checkout, base } = clone()
    expect(changed(checkout, base, 'docs\napp.txt\nweb.txt\n')).toBe('changed=true')
    expect(changed(checkout, base, 'docs\n  app.txt\n')).toBe('changed=false')
  })

  test('answers true when there is no base to compare with', () => {
    const { checkout } = clone()
    expect(changed(checkout, '', 'app.txt')).toBe('changed=true')
  })
})
