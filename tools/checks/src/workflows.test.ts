import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { parse } from 'yaml'
import { jobResults, type Trigger } from './agents/job-results'
import { git as runGit, scratchFolder } from './agents/scratch'
import { readRepositoryFile, readWorkflow, type Workflow } from './agents/workflow'

const gated: [name: string, jobs: string[], waits: Record<string, string>][] = [
  ['web', ['check', 'e2e'], { e2e: 'check' }],
  ['dictionary-core', ['check'], {}],
  ['dictionary-api', ['scripts', 'check'], { check: 'scripts' }],
  ['account-api', ['check', 'website'], { website: 'check' }],
  ['ios', ['contracts', 'swift'], { swift: 'contracts' }],
  ['language-data-build', ['build'], {}]
]

const requirable = [...gated.map(([name]) => name), 'repository', 'pull-request']
const everyJob = gated.flatMap(([name, jobs]) => jobs.map(job => [name, job]))
const waiting = gated.flatMap(([name, , waits]) =>
  Object.entries(waits).map(([heavy, fast]) => [name, heavy, fast])
)

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
  )('%s decides inside what to run, and ends in one job that always reports', (name, jobs, waits) => {
    const workflow = readWorkflow(`.github/workflows/${name}.yml`)
    expect(Object.keys(workflow.jobs)).toEqual(['changes', ...jobs, name])
    const paths = workflow.jobs.changes.steps?.find(step => step.id === 'paths')
    expect(paths?.uses).toBe('./.github/actions/changed-paths')
    expect(String(paths?.with?.paths).split(/\s+/)).toEqual(
      expect.arrayContaining([`.github/workflows/${name}.yml`, '.github/actions/changed-paths'])
    )
    for (const job of jobs) {
      const fast = waits[job]
      expect(workflow.jobs[job].needs).toEqual(fast ? ['changes', fast] : 'changes')
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

describe("what a workflow's last job reports, with its jobs played out as GitHub settles them", () => {
  const settle = (name: string, trigger: Partial<Trigger>) =>
    jobResults(readWorkflow(`.github/workflows/${name}.yml`), {
      event: 'pull_request',
      changed: true,
      vars: { IOS_SWIFT_TESTS: 'on' },
      ...trigger
    })

  describe.each(['pull_request', 'merge_group'] as const)('on %s', event => {
    test.each(
      gated
    )('%s passes, having run nothing, when the change concerns none of its paths', (name, jobs) => {
      const results = settle(name, { event, changed: false })
      for (const job of jobs) expect(results[job], job).toBe('skipped')
      expect(results[name]).toBe('success')
    })

    test.each(gated)('%s passes when each of its jobs passed', (name, jobs) => {
      const results = settle(name, { event })
      for (const job of jobs) expect(results[job], job).toBe('success')
      expect(results[name]).toBe('success')
    })

    test.each(everyJob)('%s fails when %s failed', (name, job) => {
      expect(settle(name, { event, failing: [job] })[name]).toBe('failure')
    })

    test.each(waiting)('%s never starts %s once %s has failed, and fails', (name, heavy, fast) => {
      const results = settle(name, { event, failing: [fast] })
      expect(results[fast]).toBe('failure')
      expect(results[heavy]).toBe('skipped')
      expect(results[name]).toBe('failure')
    })
  })

  test('a job skipped because the one it needs failed would pass a last job that needed it alone', () => {
    const jobs: Workflow['jobs'] = {
      fast: {},
      heavy: { needs: 'fast' },
      after: { needs: 'heavy', if: "github.event_name == 'pull_request'" },
      anyway: { needs: 'heavy', if: 'always()' },
      last: {
        if: 'always()',
        needs: ['heavy'],
        steps: [{ if: "contains(needs.*.result, 'failure')", run: 'exit 1' }]
      }
    }
    const trigger: Trigger = { event: 'pull_request', changed: true, failing: ['fast'] }
    expect(jobResults({ on: {}, jobs }, trigger)).toEqual({
      fast: 'failure',
      heavy: 'skipped',
      after: 'skipped',
      anyway: 'success',
      last: 'success'
    })
  })
})

describe('whose pull requests the rules and the review check', () => {
  const person = 'octocat'
  const unchecked = ['claude[bot]', 'dependabot[bot]', 'renovate[bot]']
  const checked = [person, 'serp-agent[bot]', 'Copilot']
  const rules = readWorkflow('.github/workflows/pull-request.yml')
  const review = readWorkflow('.github/workflows/code-review.yml')
  const opened = (workflow: Workflow, login: string, more: Partial<Trigger> = {}) =>
    jobResults(workflow, {
      event: 'pull_request',
      changed: true,
      author: { login, type: login === person ? 'User' : 'Bot' },
      ...more
    })

  test.each(checked)('checks a pull request %s opened, and starts its review', author => {
    expect(opened(rules, author)).toEqual({
      title: 'success',
      'issue-link': 'success',
      'fix-test': 'success'
    })
    expect(opened(review, author).changes).toBe('success')
  })

  test.each(unchecked)('leaves a pull request %s opened to the person who skims it', author => {
    expect(Object.values(opened(rules, author))).toEqual(['skipped', 'skipped', 'skipped'])
    expect(opened(review, author).changes).toBe('skipped')
  })

  test.each(unchecked)('passes %s in the merge queue, whose event names no author', author => {
    const results = opened(rules, author, { event: 'merge_group' })
    expect(Object.values(results)).toEqual(['success', 'success', 'success'])
  })

  test('reviews no draft, whoever opened it', () => {
    for (const author of checked)
      expect(opened(review, author, { draft: true }).changes).toBe('skipped')
  })
})

describe('the changed-paths action', () => {
  const action = parse(readRepositoryFile('.github/actions/changed-paths/action.yml')) as {
    runs: { steps: { run: string }[] }
  }
  const git = (cwd: string, ...args: string[]) => runGit(cwd, ...args).stdout.trim()

  function clone(): { checkout: string; base: string } {
    const origin = scratchFolder('paths-origin')
    const checkout = scratchFolder('paths-clone')
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
