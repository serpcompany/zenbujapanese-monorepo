import { describe, expect, test } from 'vitest'
import { claudeStep, guardAfter, readWorkflow, runNodeStep, workflowFiles } from './workflow'

const claudeJobs = workflowFiles().flatMap(path =>
  Object.entries(readWorkflow(path).jobs).flatMap(([name, job]) => {
    const steps = job.steps ?? []
    const { step: claude } = claudeStep(steps)
    return claude ? [{ job: `${path} ${name}`, steps, claude }] : []
  })
)
const cases = claudeJobs.map(({ job, steps, claude }) => [job, steps, claude] as const)

describe('the check after each Claude step in CI', () => {
  test('is found for every job that runs Claude', () => {
    expect(claudeJobs.map(({ job }) => job)).toEqual([
      '.github/workflows/claude.yml claude',
      '.github/workflows/code-review.yml review',
      '.github/workflows/maintenance.yml doc-gardening',
      '.github/workflows/maintenance.yml code-gardening'
    ])
    for (const { steps, claude } of claudeJobs) {
      expect(guardAfter(steps, claude).step).toBeDefined()
    }
  })

  test.each(cases)('runs when Claude fails, so the job shows why: %s', (_, steps, claude) => {
    expect(guardAfter(steps, claude).step.if).toBe(
      `\${{ !cancelled() && steps.${claude.id}.outcome != 'skipped' }}`
    )
  })

  test.each(
    cases
  )('says the step failed before Claude ran when it left no log: %s', async (_, steps, claude) => {
    const guard = guardAfter(steps, claude).step
    expect(guard.env?.CLAUDE_OUTCOME).toBe(`\${{ steps.${claude.id}.outcome }}`)
    const { status, output } = await runNodeStep(
      guard,
      { EXECUTION_FILE: '', CLAUDE_OUTCOME: 'failure' },
      () => undefined
    )
    expect(status).not.toBe(0)
    expect(output).toContain('failed before Claude ran')
  })
})
