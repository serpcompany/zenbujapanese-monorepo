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
  const runsOf =
    (runs: object[], status = 200): Route =>
    url =>
      url.pathname === `/repos/${repository}/actions/workflows/web-deploy.yml/runs`
        ? { status, body: status === 200 ? { workflow_runs: runs } : { message: 'Not allowed' } }
        : undefined
  const run = (attempt: string, route: Route) =>
    runNodeStep(
      script,
      {
        GITHUB_REPOSITORY: repository,
        GITHUB_REF_NAME: 'main',
        GITHUB_RUN_NUMBER: '41',
        GITHUB_RUN_ATTEMPT: attempt,
        WORKFLOW: 'web-deploy.yml'
      },
      route
    )
  const other = (number: number, status = 'completed', event = 'push') => ({
    run_number: number,
    status,
    event
  })

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

  test("passes a run's first attempt without asking GitHub", async () => {
    const { status, requests } = await run('1', runsOf([other(42), other(41)]))
    expect(status).toBe(0)
    expect(requests).toEqual([])
  })

  test('passes the latest run when it is started again', async () => {
    const { status, output } = await run('2', runsOf([other(41, 'in_progress'), other(40)]))
    expect(status).toBe(0)
    expect(output).toBe('')
  })

  test.each([
    ['finished', other(42, 'completed')],
    ['is running', other(42, 'in_progress')],
    ['waits for an approval', other(42, 'waiting')],
    ['was started by hand', other(42, 'completed', 'workflow_dispatch')]
  ])('fails an old run started again after a later run that %s', async (_, later) => {
    const { status, output } = await run('2', runsOf([later, other(41, 'in_progress')]))
    expect(status).not.toBe(0)
    expect(output).toContain('::error title=A later run has already started::')
    expect(output).toContain('run 42 on main started after it')
  })

  test.each([
    ['queued', other(42, 'queued')],
    ['pending behind it', other(42, 'pending')],
    ["a pull request's", other(43, 'completed', 'pull_request')]
  ])('passes a run started again while the only later run is %s', async (_, later) => {
    const { status } = await run('3', runsOf([later, other(41, 'in_progress')]))
    expect(status).toBe(0)
  })

  test.each([
    ['GitHub refuses the question', runsOf([], 403), '403'],
    ['GitHub lists no runs', (() => ({ status: 200, body: {} })) as Route, 'listed no runs']
  ])('fails, deploying nothing, when %s', async (_, route, message) => {
    const { status, output } = await run('2', route)
    expect(status).not.toBe(0)
    expect(output).toContain(message)
  })
})
