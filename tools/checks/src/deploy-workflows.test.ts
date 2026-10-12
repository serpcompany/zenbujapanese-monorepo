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
  staging: ['Sign the image', 'Move the :staging tag to the image'],
  production: ['Move the :production tag to the image']
}
const deploys: [string, Record<string, string[]>][] = [
  ['web-deploy', { staging: ['Deploy', 'Smoke test'], production: ['Deploy', 'Smoke test'] }],
  ['dictionary-api-deploy', imageJobs],
  ['account-api-deploy', imageJobs]
]
const mayDeploy = "steps.latest.outputs.deploy == 'true'"

describe('the deploy workflows', () => {
  test.each(
    deploys
  )('%s never deploys from a run started again once a later run exists', (name, jobs) => {
    const path = `.github/workflows/${name}.yml`
    const workflow = readWorkflow(path)
    for (const [job, deploying] of Object.entries(jobs)) {
      const steps = workflowSteps(path, job)
      const guard = steps.findIndex(step => step.uses === './.github/actions/latest-run')
      expect(guard).toBeGreaterThan(-1)
      expect(steps[guard].id).toBe('latest')
      expect(steps[guard].with?.workflow).toBe(`${name}.yml`)
      expect(steps.slice(0, guard).some(step => step.uses?.startsWith('actions/checkout@'))).toBe(
        true
      )
      for (const title of deploying) {
        const index = steps.findIndex(step => step.name === title)
        expect(index).toBeGreaterThan(guard)
        expect(steps[index].if).toBe(mayDeploy)
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
        WORKFLOW: 'web-deploy.yml',
        GITHUB_OUTPUT: 'output.txt'
      },
      route,
      { 'output.txt': '' }
    )
  const push = (number: number, event = 'push') => ({ run_number: number, event })

  test('runs its script and passes on what it says', () => {
    const [step] = action.runs.steps
    expect(step.run).toBe('node "$GITHUB_ACTION_PATH/latest-run.cjs"')
    expect(step.env).toEqual({
      GITHUB_TOKEN: '${{ inputs.token }}',
      WORKFLOW: '${{ inputs.workflow }}'
    })
    expect(action.outputs.deploy.value).toBe(`\${{ steps.${step.id}.outputs.deploy }}`)
    expect(action.inputs.token.default).toBe('${{ github.token }}')
  })

  test("lets a run's first attempt deploy without asking GitHub", async () => {
    const { status, files, requests } = await run('1', runsOf([push(42), push(41)]))
    expect(status).toBe(0)
    expect(files['output.txt']).toBe('deploy=true\n')
    expect(requests).toEqual([])
  })

  test('lets the latest run deploy when it is started again', async () => {
    const { status, files } = await run('2', runsOf([push(41), push(40)]))
    expect(status).toBe(0)
    expect(files['output.txt']).toBe('deploy=true\n')
  })

  test.each([
    ['a push', push(42)],
    ['a run by hand', push(42, 'workflow_dispatch')]
  ])('stops an old run started again after %s', async (_, later) => {
    const { status, output, files } = await run('2', runsOf([later, push(41), push(40)]))
    expect(status).toBe(0)
    expect(files['output.txt']).toBe('')
    expect(output).toContain('::notice')
    expect(output).toContain('run 42 on main is later')
  })

  test("doesn't count a pull request's run as later", async () => {
    const { files } = await run('3', runsOf([push(43, 'pull_request'), push(41)]))
    expect(files['output.txt']).toBe('deploy=true\n')
  })

  test.each([
    ['GitHub refuses the question', runsOf([], 403), '403'],
    ['GitHub lists no runs', (() => ({ status: 200, body: {} })) as Route, 'listed no runs']
  ])('fails, deploying nothing, when %s', async (_, route, message) => {
    const { status, output, files } = await run('2', route)
    expect(status).not.toBe(0)
    expect(output).toContain(message)
    expect(files['output.txt']).toBe('')
  })
})
