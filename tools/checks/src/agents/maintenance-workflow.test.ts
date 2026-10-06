import { describe, expect, test } from 'vitest'
import {
  claudeResult,
  deniedCommand,
  executionLog,
  expectFailureUnlessClaudeFinished,
  minutesAfter
} from './guards'
import {
  allowedTools,
  claudeStep,
  guardAfter,
  type Route,
  readWorkflow,
  runNodeStep,
  workflowSteps
} from './workflow'

const workflow = '.github/workflows/maintenance.yml'
const maintenance = readWorkflow(workflow)
const steps = workflowSteps(workflow, 'doc-gardening')
const { step: garden, index: gardenIndex } = claudeStep(steps)
const { step: guard, index: guardIndex } = guardAfter(steps, garden)
const codeSteps = workflowSteps(workflow, 'code-gardening')
const { step: codeGarden, index: codeGardenIndex } = claudeStep(codeSteps)
const { step: codeGuard, index: codeGuardIndex } = guardAfter(codeSteps, codeGarden)
const reportSteps = workflowSteps(workflow, 'report')

const repository = 'serpcompany/zenbujapanese-monorepo'
const startedAt = '2026-10-05T14:00:00Z'
const minutesAfterStart = (minutes: number) => minutesAfter(startedAt, minutes)

interface OpenPr {
  number: number
  ref: string
  createdAt: string
}

function openPullRequests(openPrs: OpenPr[], status: number): Route {
  return url => {
    if (url.pathname !== `/repos/${repository}/pulls` || url.searchParams.get('base') !== 'main') {
      return undefined
    }
    if (status !== 200) return { status, body: { message: 'Not allowed' } }
    return {
      status,
      body: openPrs.map(pr => ({
        number: pr.number,
        title: 'Split the website guide by task (#516)',
        head: { ref: pr.ref },
        created_at: pr.createdAt
      }))
    }
  }
}

function guardRunner(step: typeof guard) {
  return (log: unknown, openPrs: OpenPr[] = [], status = 200) => {
    const { env, files } = executionLog(log)
    return runNodeStep(
      step,
      { ...env, GARDENING_STARTED_AT: startedAt, GITHUB_REPOSITORY: repository },
      openPullRequests(openPrs, status),
      files
    )
  }
}

const runGuard = guardRunner(guard)
const runCodeGuard = guardRunner(codeGuard)

const result = claudeResult({
  num_turns: 12,
  total_cost_usd: 0.4,
  result: 'I fixed one stale doc and opened a pull request.'
})
const openedNow = { number: 41, ref: 'docs/gardening-2026-10-05', createdAt: minutesAfterStart(3) }
const openedLastWeek = {
  number: 39,
  ref: 'docs/gardening-2026-09-28',
  createdAt: minutesAfterStart(-7 * 24 * 60)
}
const gardenedNow = {
  number: 51,
  ref: 'chore/code-gardening-2026-10-05',
  createdAt: minutesAfterStart(20)
}
const deniedCommit = deniedCommand('git checkout -b docs/gardening && git commit')

describe('the Weekly maintenance workflow', () => {
  test('runs every job on the schedule, and only the chosen one by hand', () => {
    const dispatch = maintenance.on.workflow_dispatch as {
      inputs: { job: { options: string[]; default: string } }
    }
    expect(dispatch.inputs.job.options).toEqual([
      'all',
      'doc-gardening',
      'code-gardening',
      'report'
    ])
    expect(dispatch.inputs.job.default).toBe('all')
    expect(Object.keys(maintenance.jobs)).toEqual(['doc-gardening', 'code-gardening', 'report'])
    for (const [name, job] of Object.entries(maintenance.jobs)) {
      expect(job.if, name).toBe(
        `github.event_name != 'workflow_dispatch' || inputs.job == 'all' || inputs.job == '${name}'`
      )
    }
  })

  test('gardens the docs from the maintenance report', () => {
    const reportIndex = steps.findIndex(step => step.run?.includes('pnpm -s maintenance:report'))
    expect(reportIndex).toBeGreaterThan(-1)
    expect(reportIndex).toBeLessThan(gardenIndex)
    const prompt = String(garden.with?.prompt)
    expect(prompt).toContain('tmp/maintenance-report.md')
    expect(prompt).toContain(
      'Re-grade each row listed under "Scores to re-grade" in docs/quality.md'
    )
    expect(prompt).toContain("Set the row's Graded date to today (UTC)")
    expect(prompt).toContain('--body-file tmp/pr-body.md')
  })

  test('pins the model, keeps subagents in the foreground, and leaves the MCP servers out', () => {
    for (const step of [garden, codeGarden]) {
      expect(step.id).toBe('garden')
      expect(step.env?.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS).toBe('1')
      expect(step.env?.BASH_DEFAULT_TIMEOUT_MS).toBe('900000')
      expect(String(step.with?.claude_args)).toContain('--model claude-sonnet-5-5')
      expect(String(step.with?.claude_args)).toContain('--strict-mcp-config')
    }
  })

  test('checks each gardening job afterwards, from when it started', () => {
    for (const [jobSteps, gardenAt, guardAt, guardStep] of [
      [steps, gardenIndex, guardIndex, guard],
      [codeSteps, codeGardenIndex, codeGuardIndex, codeGuard]
    ] as const) {
      expect(guardAt).toBeGreaterThan(gardenAt)
      expect(guardStep.env?.GITHUB_TOKEN).toBe('${{ github.token }}')
      const startIndex = jobSteps.findIndex(step => step.run?.includes('GARDENING_STARTED_AT='))
      expect(startIndex).toBeGreaterThan(-1)
      expect(startIndex).toBeLessThan(gardenAt)
    }
  })

  test('writes the report under tmp/, since a Markdown file at the root fails the docs check the report runs', () => {
    const runs = reportSteps.map(step => step.run ?? '').join('\n')
    expect(runs).toContain('pnpm -s maintenance:report > tmp/weekly-report.md')
    expect(runs).not.toMatch(/> [\w-]+\.md/)
    expect(runs).toContain('gh issue edit "$number" --body-file tmp/weekly-report.md')
    expect(runs).toContain('gh issue create --title "$TITLE" --body-file tmp/weekly-report.md')
    expect(runs).not.toContain('--body-file report.md')
  })
})

describe("doc gardening's guard", () => {
  test('fails unless Claude finished: no log, no result, an error, or subagents still running', async () => {
    await expectFailureUnlessClaudeFinished(log => runGuard(log), result)
  })

  test('passes when Claude opened a gardening pull request during the run', async () => {
    const { status, output } = await runGuard([result()], [openedNow])
    expect(status).toBe(0)
    expect(output).toContain('opened #41')
  })

  test('passes when Claude found no doc drift', async () => {
    expect((await runGuard([result({ result: 'No doc drift found' })])).status).toBe(0)
  })

  test("passes when last week's pull request is still open and Claude left it alone", async () => {
    const { status, output } = await runGuard(
      [result({ result: 'A gardening pull request is already open (#39), so I stopped.' })],
      [openedLastWeek]
    )
    expect(status).toBe(0)
    expect(output).toContain('#39')
  })

  test('fails when Claude finished without any of those, and shows what it said', async () => {
    const { status, output } = await runGuard([result({ result: 'Done.' })], [openedLastWeek])
    expect(status).not.toBe(0)
    expect(output).toContain('Done.')
  })

  test('warns but passes when a refused command was retried and the pull request opened', async () => {
    const { status, output } = await runGuard([result(deniedCommit)], [openedNow])
    expect(status).toBe(0)
    expect(output).toContain('::warning')
    expect(output).toContain('git checkout -b')
  })

  test('fails and names the command when a denial left the job undone', async () => {
    const { status, output } = await runGuard([result({ ...deniedCommit, result: 'Stopped.' })])
    expect(status).not.toBe(0)
    expect(output).toContain('git checkout -b')
  })

  test("fails when it can't list the open pull requests", async () => {
    const { status, output } = await runGuard([result()], [], 403)
    expect(status).not.toBe(0)
    expect(output).toContain("Couldn't list the open pull requests")
  })
})

describe('the code gardening job', () => {
  test('skips the week while a code gardening pull request is still open', () => {
    const [skip, ...rest] = codeSteps
    expect(skip.run).toContain('--base main')
    expect(skip.run).toContain('startswith("chore/code-gardening-")')
    expect(skip.run).toContain('echo "GARDEN=true"')
    expect(rest.every(step => step.if?.includes("env.GARDEN == 'true'"))).toBe(true)
    expect(maintenance.jobs['code-gardening']['timeout-minutes']).toBe(60)
  })

  test('installs every package, since it may change any of them and checks them all', () => {
    expect(codeSteps.some(step => step.run === 'pnpm install --frozen-lockfile')).toBe(true)
    expect(allowedTools(codeGarden)).toEqual(
      expect.arrayContaining(['Bash(pnpm check)', 'Bash(gh pr create:*)', 'Bash(git:*)'])
    )
    expect(allowedTools(codeGarden).some(tool => tool.includes('gh pr merge'))).toBe(false)
  })

  test('fixes the first small debt row, or splits a file near the size limit, passing over what a person decides', () => {
    const prompt = String(codeGarden.with?.prompt)
    expect(prompt).toContain('the first row of docs/tech-debt.md whose Size is `small`')
    expect(prompt).toContain('"Files near the size limit"')
    for (const passedOver of [
      'a deploy',
      'a language-data release or anything in R2',
      'a change under apps/ios or in Swift',
      'the behavior or wording a product doc describes',
      'an ADR-level decision'
    ]) {
      expect(prompt).toContain(passedOver)
    }
    expect(prompt).toContain('Run `pnpm check`')
    expect(prompt).toContain('chore/code-gardening-<YYYY-MM-DD>')
    expect(prompt).toContain('--body-file tmp/pr-body.md')
    expect(prompt).toContain('Write no code')
  })

  test('passes when Claude opened one gardening pull request', async () => {
    const { status, output } = await runCodeGuard(
      [result({ result: 'Opened #51.' })],
      [gardenedNow]
    )
    expect(status).toBe(0)
    expect(output).toContain('Code gardening opened #51: Split the website guide by task (#516).')
  })

  test('passes when Claude found nothing to garden', async () => {
    const said = 'Nothing to garden: every small row needs the owner.'
    expect((await runCodeGuard([result({ result: said })], [openedNow])).status).toBe(0)
  })

  test('fails when Claude opened more than one pull request, since it fixes one item a week', async () => {
    const { status, output } = await runCodeGuard(
      [result()],
      [gardenedNow, { ...gardenedNow, number: 52 }]
    )
    expect(status).not.toBe(0)
    expect(output).toContain('#51, #52')
  })

  test('fails when Claude neither opened a pull request nor found nothing to garden', async () => {
    const said = 'Gardening failed: pnpm check reports 2 lint errors.'
    const { status, output } = await runCodeGuard([result({ result: said })])
    expect(status).not.toBe(0)
    expect(output).toContain(said)
  })

  test('fails unless Claude finished, or when it cannot list the pull requests', async () => {
    await expectFailureUnlessClaudeFinished(log => runCodeGuard(log), result)
    const { status, output } = await runCodeGuard([result()], [], 403)
    expect(status).not.toBe(0)
    expect(output).toContain("Couldn't list the open pull requests")
  })
})
