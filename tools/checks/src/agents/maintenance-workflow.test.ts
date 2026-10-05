import { describe, expect, test } from 'vitest'
import { claudeStep, guardAfter, runNodeStep, workflowSteps } from './workflow'

const workflow = '.github/workflows/maintenance.yml'
const steps = workflowSteps(workflow, 'doc-gardening')
const { step: garden, index: gardenIndex } = claudeStep(steps)
const { step: guard, index: guardIndex } = guardAfter(steps, garden)

const repository = 'serpcompany/zenbujapanese-monorepo'
const startedAt = '2026-10-05T14:00:00Z'
const minutesAfterStart = (minutes: number) =>
  new Date(Date.parse(startedAt) + minutes * 60_000).toISOString()

interface OpenPr {
  number: number
  ref: string
  createdAt: string
}

function runGuard(log: unknown, openPrs: OpenPr[] = [], status = 200) {
  const files: Record<string, string> = log === undefined ? {} : { 'log.json': JSON.stringify(log) }
  return runNodeStep(
    guard,
    {
      EXECUTION_FILE: log === undefined ? '' : 'log.json',
      GARDENING_STARTED_AT: startedAt,
      GITHUB_REPOSITORY: repository
    },
    url => {
      if (
        url.pathname !== `/repos/${repository}/pulls` ||
        url.searchParams.get('base') !== 'main'
      ) {
        return undefined
      }
      return {
        status,
        body:
          status === 200
            ? openPrs.map(pr => ({
                number: pr.number,
                head: { ref: pr.ref },
                created_at: pr.createdAt
              }))
            : { message: 'Not allowed' }
      }
    },
    files
  )
}

const result = (overrides: Record<string, unknown> = {}) => ({
  type: 'result',
  subtype: 'success',
  is_error: false,
  num_turns: 12,
  total_cost_usd: 0.4,
  permission_denials: [],
  result: 'I fixed one stale doc and opened a pull request.',
  ...overrides
})
const openedNow = { number: 41, ref: 'docs/gardening-2026-10-05', createdAt: minutesAfterStart(3) }
const openedLastWeek = {
  number: 39,
  ref: 'docs/gardening-2026-09-28',
  createdAt: minutesAfterStart(-7 * 24 * 60)
}
const deniedCommit = {
  permission_denials: [
    { tool_name: 'Bash', tool_input: { command: 'git checkout -b docs/gardening && git commit' } }
  ]
}

describe('the Weekly maintenance workflow', () => {
  test('gardens from the maintenance report', () => {
    const reportIndex = steps.findIndex(step => step.run?.includes('pnpm -s maintenance:report'))
    expect(reportIndex).toBeGreaterThan(-1)
    expect(reportIndex).toBeLessThan(gardenIndex)
    expect(String(garden.with?.prompt)).toContain('tmp/maintenance-report.md')
  })

  test('keeps subagents in the foreground and leaves the MCP servers out', () => {
    expect(garden.id).toBe('garden')
    expect(garden.env?.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS).toBe('1')
    expect(String(garden.with?.claude_args)).toContain('--strict-mcp-config')
  })

  test('checks the outcome afterwards, from when gardening started', () => {
    expect(guardIndex).toBeGreaterThan(gardenIndex)
    expect(guard.env?.GITHUB_TOKEN).toBe('${{ github.token }}')
    const startIndex = steps.findIndex(step => step.run?.includes('GARDENING_STARTED_AT='))
    expect(startIndex).toBeGreaterThan(-1)
    expect(startIndex).toBeLessThan(gardenIndex)
  })

  test('posts the same report as one issue', () => {
    const report = workflowSteps(workflow, 'report')
    expect(
      report.some(step =>
        step.run?.includes('pnpm -s maintenance:report > tmp/maintenance-report.md')
      )
    ).toBe(true)
    expect(
      report.some(step =>
        step.run?.includes('gh issue edit "$number" --body-file tmp/maintenance-report.md')
      )
    ).toBe(true)
  })
})

describe("doc gardening's guard", () => {
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

  test('fails when the run left no log, no result, or ended in an error', async () => {
    expect((await runGuard(undefined)).status).not.toBe(0)
    expect((await runGuard([{ type: 'system', subtype: 'init' }])).status).not.toBe(0)
    expect(
      (await runGuard([result({ is_error: true, subtype: 'error_max_turns' })])).status
    ).not.toBe(0)
  })

  test('fails when Claude ended with subagents still running', async () => {
    const { status, output } = await runGuard([
      { type: 'system', subtype: 'background_tasks_changed', tasks: [{ id: 'task-1' }] },
      result()
    ])
    expect(status).not.toBe(0)
    expect(output).toContain('background task')
  })

  test("fails when it can't list the open pull requests", async () => {
    const { status, output } = await runGuard([result()], [], 403)
    expect(status).not.toBe(0)
    expect(output).toContain("Couldn't list the open pull requests")
  })
})
