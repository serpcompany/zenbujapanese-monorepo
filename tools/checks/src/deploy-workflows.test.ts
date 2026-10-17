import { describe, expect, test } from 'vitest'
import { parse } from 'yaml'
import {
  type Route,
  readRepositoryFile,
  readWorkflow,
  runNodeStep,
  workflowSteps
} from './agents/workflow'

const imageJobs = {
  image: ['Push the image'],
  staging: ['Sign the image', 'Move the :staging tag to the image'],
  production: ['Move the :production tag to the image']
}
const deploys: [string, Record<string, string[]>][] = [
  ['web-deploy', { staging: ['Deploy', 'Smoke test'], production: ['Deploy', 'Smoke test'] }],
  ['dictionary-api-deploy', imageJobs],
  ['account-api-deploy', imageJobs]
]

describe('the deploy workflows', () => {
  test.each(
    deploys
  )('%s refuses, in every job that pushes or deploys, an old run started again', (name, jobs) => {
    const path = `.github/workflows/${name}.yml`
    const workflow = readWorkflow(path)
    for (const [job, deploying] of Object.entries(jobs)) {
      const steps = workflowSteps(path, job)
      const guard = steps.findIndex(step => step.uses === './.github/actions/latest-run')
      expect(guard).toBeGreaterThan(-1)
      expect(steps[guard].with?.workflow).toBe(`${name}.yml`)
      expect(steps.slice(0, guard).every(step => step.uses?.startsWith('actions/checkout@'))).toBe(
        true
      )
      expect(guard).toBeGreaterThan(0)
      for (const title of deploying) {
        const index = steps.findIndex(step => step.name === title)
        expect(index).toBeGreaterThan(guard)
        expect(steps[index].if ?? steps[guard].if).toBe(steps[guard].if)
      }
      const permissions = { ...workflow.permissions, ...workflow.jobs[job].permissions }
      expect(permissions.actions).toBe('read')
    }
  })

  test.each(deploys)('%s runs one at a time on main, and is never cancelled there', name => {
    const { concurrency } = readWorkflow(`.github/workflows/${name}.yml`)
    expect(concurrency?.group).toMatch(new RegExp(`^${name}($|-)`))
    expect([false, "${{ github.event_name == 'pull_request' }}"]).toContain(
      concurrency?.['cancel-in-progress']
    )
  })

  test("only a pull request's image job, which pushes nothing, goes without the guard", () => {
    for (const name of ['dictionary-api-deploy', 'account-api-deploy']) {
      const steps = workflowSteps(`.github/workflows/${name}.yml`, 'image')
      const guard = steps.find(step => step.uses === './.github/actions/latest-run')
      const push = steps.find(step => step.name === 'Push the image')
      expect(guard?.if).toBe("github.event_name != 'pull_request'")
      expect(push?.if).toBe("github.event_name != 'pull_request'")
    }
  })
})

describe('the latest-run action', () => {
  const action = parse(readRepositoryFile('.github/actions/latest-run/action.yml'))
  const script = { run: readRepositoryFile('.github/actions/latest-run/latest-run.cjs') }
  const repository = 'serpcompany/zenbujapanese-monorepo'
  const runsPath = `/repos/${repository}/actions/workflows/web-deploy.yml/runs`

  interface Job {
    name: string
    status: string
    conclusion: string | null
    steps?: object[]
  }
  interface Run {
    id: number
    run_number: number
    status: string
    event: string
    run_attempt: number
    conclusion?: string
    jobs: Job[]
  }

  const done = (name: string, conclusion = 'success'): Job => ({
    name,
    status: 'completed',
    conclusion,
    steps: [{ name: 'Set up job' }]
  })
  const other = (number: number, jobs: Job[] = [], changes: Partial<Run> = {}): Run => ({
    id: 9000 + number,
    run_number: number,
    status: 'completed',
    event: 'push',
    run_attempt: 1,
    jobs,
    ...changes
  })
  const github =
    (runs: Run[], refuse?: 'runs' | 'jobs'): Route =>
    url => {
      const refused = { status: 403, body: { message: 'Not allowed' } }
      if (url.pathname === runsPath) {
        return refuse === 'runs' ? refused : { status: 200, body: { workflow_runs: runs } }
      }
      const run = runs.find(each => url.pathname.endsWith(`/actions/runs/${each.id}/jobs`))
      if (!run) return undefined
      return refuse === 'jobs' ? refused : { status: 200, body: { jobs: run.jobs } }
    }
  const guard = (job: string, runs: Run[], attempt = '1', refuse?: 'runs' | 'jobs') =>
    runNodeStep(
      script,
      {
        GITHUB_REPOSITORY: repository,
        GITHUB_REF_NAME: 'main',
        GITHUB_RUN_NUMBER: '41',
        GITHUB_RUN_ATTEMPT: attempt,
        GITHUB_JOB: job,
        WORKFLOW: 'web-deploy.yml'
      },
      github(runs, refuse)
    )
  const mine = other(41, [], { status: 'in_progress' })

  test('runs its script with the token and the workflow it is given', () => {
    const [step] = action.runs.steps
    expect(step.run).toBe('node "$GITHUB_ACTION_PATH/latest-run.cjs"')
    expect(step.env).toEqual({
      GITHUB_TOKEN: '${{ inputs.token }}',
      WORKFLOW: '${{ inputs.workflow }}'
    })
    expect(action.inputs.token.default).toBe('${{ github.token }}')
    expect(action.outputs).toBeUndefined()
  })

  test('passes the latest run, asking for no jobs', async () => {
    const { status, output, requests } = await guard('staging', [
      mine,
      other(40, [done('staging')])
    ])
    expect(status).toBe(0)
    expect(output).toBe('')
    expect(requests.map(request => request.path)).toEqual([runsPath])
  })

  test('passes while a later run only waits behind this one, asking for no jobs', async () => {
    const queued = other(42, [], { status: 'pending' })
    const { status, requests } = await guard('staging', [queued, mine])
    expect(status).toBe(0)
    expect(requests).toHaveLength(1)
  })

  test.each([
    ['on its first attempt, when GitHub started the later run first', '1'],
    ['when it is started again', '2']
  ])('fails a job a later run has already run, %s', async (_, attempt) => {
    const { status, output } = await guard('staging', [other(42, [done('staging')]), mine], attempt)
    expect(status).not.toBe(0)
    expect(output).toContain('::error title=A later run has already run this job::')
    expect(output).toContain('run 42 on main, which is later, has already run its staging job')
  })

  test.each<[string, Run]>([
    [
      'is running it now',
      other(42, [{ name: 'staging', status: 'in_progress', conclusion: null }])
    ],
    ['failed in it', other(42, [done('staging', 'failure')])],
    ['was cancelled part way through it', other(42, [done('staging', 'cancelled')])],
    ['was started by hand', other(42, [done('staging')], { event: 'workflow_dispatch' })],
    [
      'ran it, then was started again and waits',
      other(42, [done('staging')], { status: 'pending', run_attempt: 2 })
    ]
  ])('fails when a later run %s', async (_, later) => {
    expect((await guard('staging', [later, mine], '2')).status).not.toBe(0)
  })

  test.each<[string, string, Run]>([
    [
      'stopped at staging and never ran production',
      'production',
      other(42, [done('staging'), done('production', 'skipped')])
    ],
    [
      'failed before it reached this job',
      'staging',
      other(42, [done('image', 'failure'), done('staging', 'skipped')])
    ],
    [
      'was replaced while it waited, with no job run',
      'staging',
      other(42, [], { conclusion: 'cancelled' })
    ],
    [
      'had this job cancelled before it started',
      'staging',
      other(42, [{ name: 'staging', status: 'completed', conclusion: 'cancelled', steps: [] }])
    ],
    ["was a pull request's", 'image', other(43, [done('image')], { event: 'pull_request' })]
  ])('passes when the later run %s', async (_, job, later) => {
    const { status, output } = await guard(job, [later, mine], '2')
    expect(output).toBe('')
    expect(status).toBe(0)
  })

  test.each<[string, 'runs' | 'jobs', string]>([
    ['the runs', 'runs', '/actions/workflows/web-deploy.yml/runs returned 403'],
    ["a later run's jobs", 'jobs', '/actions/runs/9042/jobs returned 403']
  ])('fails, deploying nothing, when GitHub refuses %s', async (_, refuse, message) => {
    const { status, output } = await guard(
      'staging',
      [other(42, [done('staging')]), mine],
      '2',
      refuse
    )
    expect(status).not.toBe(0)
    expect(output).toContain(message)
  })
})
