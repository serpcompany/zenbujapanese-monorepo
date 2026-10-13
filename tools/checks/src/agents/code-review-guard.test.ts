import { describe, expect, test } from 'vitest'
import {
  bot,
  environment,
  github,
  guard,
  minutesAfterStart,
  type PullRequest,
  requestReply,
  summaryBody,
  summaryBot,
  summaryOf
} from './code-review-support'
import {
  claudeResult,
  deniedCommand,
  executionLog,
  expectFailureUnlessClaudeFinished
} from './guards'
import { runNodeStep } from './workflow'

function runGuard(log: unknown, pullRequest: PullRequest = {}, retryOutcome = 'skipped') {
  const { env, files } = executionLog(log)
  return runNodeStep(
    guard,
    { ...environment, ...env, CLAUDE_OUTCOME: 'success', RETRY_OUTCOME: retryOutcome },
    github(pullRequest),
    files
  )
}

const result = claudeResult({
  num_turns: 24,
  duration_ms: 312_000,
  total_cost_usd: 2.4,
  modelUsage: { 'claude-sonnet-5-5': {} },
  result: 'Posted 2 inline comments.'
})
const cleanLog = [{ type: 'system', subtype: 'init' }, result()]
const summaryPosted = (coverage: string): PullRequest => ({
  issueComments: [{ login: summaryBot, at: minutesAfterStart(4), details: summaryOf(coverage) }]
})
const deniedView = deniedCommand('gh pr view 7 --comments')

describe("the review's guard", () => {
  test('fails unless Claude finished: no log, no result, an error, or subagents still running', async () => {
    await expectFailureUnlessClaudeFinished(log => runGuard(log), result)
  })

  test('fails when Claude posted nothing, and shows what Claude said', async () => {
    const { status, output } = await runGuard(
      [result({ result: 'This only bumps a version, so it needs no review.' })],
      { issueComments: [{ login: 'someone', at: minutesAfterStart(3) }] }
    )
    expect(status).not.toBe(0)
    expect(output).toContain('needs no review')
  })

  test('fails and names the command when Claude was denied a tool and posted nothing', async () => {
    const { status, output } = await runGuard([result(deniedView)])
    expect(status).not.toBe(0)
    expect(output).toContain('gh pr view 7 --comments')
  })

  test("fails when it can't read the pull request", async () => {
    const { status, output } = await runGuard(cleanLog, { status: 403 })
    expect(status).not.toBe(0)
    expect(output).toContain('403')
  })

  test.each<[string, PullRequest]>([
    [
      'a summary comment',
      { issueComments: [{ login: summaryBot, at: minutesAfterStart(4), details: summaryBody }] }
    ],
    [
      'an update to its summary',
      {
        issueComments: [
          {
            login: summaryBot,
            at: minutesAfterStart(-90),
            updatedAt: minutesAfterStart(4),
            details: summaryBody
          }
        ]
      }
    ]
  ])('passes when the workflow posted %s during the run', async (_, pullRequest) => {
    const { status, output } = await runGuard(cleanLog, pullRequest)
    expect(output).not.toContain('::error')
    expect(output).toContain('about $2.40')
    expect(output).toContain('Claude posted or updated 1 comment(s) or review(s)')
    expect(status).toBe(0)
  })

  test.each([
    ['left files unread without its reviewers', 'Read 2 of 61 changed files.\nNot read: the rest.'],
    ['left files unread and unnamed', 'Read 2 of 61 changed files.'],
    ['does not say what it read', 'No coverage here.'],
    ['counts more files read than changed', 'Read 5 of 4 changed files.']
  ])('passes a review that was posted but %s: its comment is labelled instead', async (_, coverage) => {
    const { status, output } = await runGuard(cleanLog, summaryPosted(coverage))
    expect(output).not.toContain('::error')
    expect(status).toBe(0)
  })

  test('fails when the review left only inline findings and no summary', async () => {
    const { status, output } = await runGuard(cleanLog, {
      reviewComments: [{ login: bot, at: minutesAfterStart(5) }]
    })
    expect(status).not.toBe(0)
    expect(output).toContain('Claude posted findings but no summary')
  })

  test('reads the second attempt when there was one, and says when it failed before Claude ran', async () => {
    const passed = await runGuard(cleanLog, summaryPosted('Read 4 of 4 changed files.'), 'success')
    expect(passed.status).toBe(0)
    const failed = await runGuard(undefined, summaryPosted('Read 4 of 4 changed files.'), 'failure')
    expect(failed.status).not.toBe(0)
    expect(failed.output).toContain('failed before Claude ran')
  })

  test('says no review happened when the action ran nothing', async () => {
    const { status, output } = await runGuard(undefined)
    expect(status).not.toBe(0)
    expect(output).toContain('wrote no execution log, so no review happened')
    expect(output).toContain("differs from main's")
  })

  test("doesn't count Claude's reply to an @claude request, or in a review thread, as the review", async () => {
    const { status, output } = await runGuard(cleanLog, {
      issueComments: [{ login: bot, at: minutesAfterStart(3), details: requestReply }],
      reviewComments: [
        {
          login: bot,
          at: minutesAfterStart(4),
          details: { in_reply_to_id: 11, body: 'Fixed in abc1234.' }
        }
      ]
    })
    expect(output).toContain('::error')
    expect(status).not.toBe(0)
  })

  test("doesn't count a summary that the workflow didn't post", async () => {
    const { status } = await runGuard(cleanLog, {
      issueComments: [
        { login: bot, at: minutesAfterStart(3), details: summaryBody },
        { login: 'someone', at: minutesAfterStart(4), details: summaryBody }
      ]
    })
    expect(status).not.toBe(0)
  })

  test('warns but passes when Claude posted despite a denied tool', async () => {
    const { status, output } = await runGuard(
      [result(deniedView)],
      summaryPosted('Read 4 of 4 changed files.')
    )
    expect(output).toContain('::warning')
    expect(status).toBe(0)
  })

  test('fails when only an earlier push was reviewed', async () => {
    const { status } = await runGuard(cleanLog, {
      reviewComments: [{ login: bot, at: minutesAfterStart(-90) }],
      issueComments: [{ login: summaryBot, at: minutesAfterStart(-90), details: summaryBody }]
    })
    expect(status).not.toBe(0)
  })
})
