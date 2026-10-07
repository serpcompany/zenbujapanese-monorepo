import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
  readRepositoryFile,
  readWorkflow,
  runNodeStep,
  workflowSteps
} from './workflow'

const steps = workflowSteps('.github/workflows/code-review.yml', 'review')
const { step: review, index: reviewIndex } = claudeStep(steps)
const claudeArgs = String(review?.with?.claude_args ?? '')
const skill = readRepositoryFile('.claude/skills/pr-review/SKILL.md')
const skillTools = (/^allowed-tools:\s*(.+)$/m.exec(skill)?.[1] ?? '')
  .split(',')
  .map(tool => tool.trim())
  .filter(Boolean)
const repository = 'serpcompany/zenbujapanese-monorepo'
const pr = '7'
const bot = 'claude[bot]'
const summaryBot = 'github-actions[bot]'
const startedAt = '2026-10-01T10:00:00Z'
const minutesAfterStart = (minutes: number) => minutesAfter(startedAt, minutes)
const summaryBody = { body: '## Claude review\nReviewed abc1234.\n\nNo new findings.' }
const requestReply = { body: 'Done: I renamed the helper in abc1234.' }

interface Posted {
  login: string
  at: string
  updatedAt?: string
  details?: Record<string, unknown>
}

interface PullRequest {
  issueComments?: Posted[]
  reviewComments?: Posted[]
  reviews?: Posted[]
  status?: number
}

function github(pullRequest: PullRequest): Route {
  const comments = (items: Posted[] = []) =>
    items.map(({ login, at, updatedAt, details }) => ({
      user: { login },
      created_at: at,
      updated_at: updatedAt ?? at,
      ...details
    }))
  const routes: Record<string, unknown[]> = {
    [`/repos/${repository}/issues/${pr}/comments`]: comments(pullRequest.issueComments),
    [`/repos/${repository}/pulls/${pr}/comments`]: comments(pullRequest.reviewComments),
    [`/repos/${repository}/pulls/${pr}/reviews`]: (pullRequest.reviews ?? []).map(
      ({ login, at }) => ({ user: { login }, submitted_at: at })
    )
  }
  return url => {
    const body = routes[url.pathname]
    if (!body) return undefined
    const status = pullRequest.status ?? 200
    return { status, body: status === 200 ? body : { message: 'Not allowed' } }
  }
}

const environment = {
  GITHUB_REPOSITORY: repository,
  PR_NUMBER: pr,
  REVIEW_BOT: bot,
  SUMMARY_BOT: summaryBot,
  REVIEW_STARTED_AT: startedAt
}

const { step: guard, index: guardIndex } = guardAfter(steps, review)

function runGuard(log: unknown, pullRequest: PullRequest = {}) {
  const { env, files } = executionLog(log)
  return runNodeStep(guard, { ...environment, ...env }, github(pullRequest), files)
}

const result = claudeResult({
  num_turns: 24,
  duration_ms: 312_000,
  total_cost_usd: 2.4,
  modelUsage: { 'claude-sonnet-5-5': {} },
  result: 'Posted 2 inline comments.'
})
const cleanLog = [{ type: 'system', subtype: 'init' }, result()]
const deniedView = deniedCommand('gh pr view 7 --comments')

describe('the Code review workflow', () => {
  test('runs the pr-review skill with every tool the skill uses', () => {
    expect(review?.id).toBeTruthy()
    expect(review.with?.prompt).toBe(
      '/pr-review ${{ github.repository }}/pull/${{ github.event.pull_request.number }}'
    )
    expect(review.with?.plugins).toBeUndefined()
    expect(skillTools).toContain('mcp__github_inline_comment__create_inline_comment')
    const allowed = allowedTools(review)
    expect(skillTools.filter(tool => !allowed.includes(tool))).toEqual([])
  })

  test('lets claude[bot] start a review, since its @claude fixes push to the pull request', () => {
    expect(review.with?.allowed_bots).toBe('claude[bot]')
  })

  test('lets Claude post only inline findings, and write its summary to a file', () => {
    for (const tools of [allowedTools(review), skillTools]) {
      expect(tools).toContain('Write')
      expect(tools.filter(tool => /gh api|gh pr comment|gh pr review/.test(tool))).toEqual([])
    }
    expect(skill).toContain('`tmp/review-summary.md`')
    expect(skill).toContain('Never use `gh pr comment --edit-last`')
  })

  test('keeps subagents in the foreground, pins the model, and leaves the MCP servers out', () => {
    expect(review.env?.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS).toBe('1')
    expect(claudeArgs).toMatch(/--model claude-/)
    expect(claudeArgs).toContain('--strict-mcp-config')
  })

  test("gives Claude and its subagents the base branch's rules, outside the checkout", () => {
    for (const step of steps) expect(step.run ?? '').not.toMatch(/>\s*"?CLAUDE\.md/)
    const rulesIndex = steps.findIndex(step =>
      step.run?.includes('"$RUNNER_TEMP/review-context.md"')
    )
    expect(rulesIndex).toBeGreaterThan(-1)
    expect(rulesIndex).toBeLessThan(reviewIndex)
    const rules = steps[rulesIndex]
    expect(rules.env?.BASE_REF).toBe('${{ github.event.pull_request.base.ref }}')
    expect(rules.env?.RULES?.split(' ')).toEqual(
      expect.arrayContaining(['AGENTS.md', 'ARCHITECTURE.md', 'docs/agents/code.md', 'CONTEXT.md'])
    )
    expect(rules.run).toContain('git show "FETCH_HEAD:$file"')
    for (const flag of ['--append-system-prompt-file', '--append-subagent-system-prompt-file']) {
      expect(claudeArgs).toContain(`${flag} \${{ runner.temp }}/review-context.md`)
    }
  })

  test('checks the review afterwards, from when it started', () => {
    expect(guardIndex).toBeGreaterThan(reviewIndex)
    expect(guard.shell).toBe('node {0}')
    expect(guard.env).toMatchObject({
      GITHUB_TOKEN: '${{ github.token }}',
      REVIEW_BOT: bot,
      SUMMARY_BOT: summaryBot
    })
    const startIndex = steps.findIndex(step => step.run?.includes('REVIEW_STARTED_AT='))
    expect(startIndex).toBeGreaterThan(-1)
    expect(startIndex).toBeLessThan(reviewIndex)
  })
})

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
    ['inline comments', { reviewComments: [{ login: bot, at: minutesAfterStart(5) }] }],
    ['a review', { reviews: [{ login: bot, at: minutesAfterStart(5) }] }],
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
  ])('passes when Claude posted %s during the run', async (_, pullRequest) => {
    const { status, output } = await runGuard(cleanLog, pullRequest)
    expect(output).not.toContain('::error')
    expect(output).toContain('about $2.40')
    expect(status).toBe(0)
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
    const { status, output } = await runGuard([result(deniedView)], {
      reviewComments: [{ login: bot, at: minutesAfterStart(5) }]
    })
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

describe('the earlier findings given to the review', () => {
  const findingsIndex = steps.findIndex(step => step.env?.CONTEXT_FILE !== undefined)
  const findings = steps[findingsIndex]
  const runFindings = async (pullRequest: PullRequest) => {
    const run = await runNodeStep(
      findings,
      { ...environment, CONTEXT_FILE: 'context.md', GITHUB_OUTPUT: 'output.txt' },
      github(pullRequest),
      { 'context.md': '# Repository rules for this review\n', 'output.txt': '' }
    )
    return { ...run, context: run.files['context.md'], outputs: run.files['output.txt'] }
  }

  test('are read before the review, after the rules', () => {
    const rulesIndex = steps.findIndex(step =>
      step.run?.includes('"$RUNNER_TEMP/review-context.md"')
    )
    expect(findingsIndex).toBeGreaterThan(rulesIndex)
    expect(findingsIndex).toBeLessThan(reviewIndex)
    expect(findings.env).toMatchObject({
      GITHUB_TOKEN: '${{ github.token }}',
      REVIEW_BOT: bot,
      SUMMARY_BOT: summaryBot
    })
  })

  test("list Claude's inline comments and summary, and nobody else's", async () => {
    const { status, context } = await runFindings({
      reviewComments: [
        {
          login: bot,
          at: minutesAfterStart(-60),
          details: {
            path: 'apps/web/src/lib/dictionary/api.ts',
            line: 18,
            commit_id: 'abc1234def',
            html_url: 'https://github.com/c/1',
            body: '**The token is logged.** It reaches Workers Logs.'
          }
        },
        {
          login: bot,
          at: minutesAfterStart(-60),
          details: {
            path: 'apps/dictionary-api/src/app.ts',
            line: null,
            original_line: 9,
            commit_id: 'abc1234def',
            html_url: 'https://github.com/c/2',
            body: 'Answers 500 for a 404.'
          }
        },
        {
          login: 'someone',
          at: minutesAfterStart(-50),
          details: { path: 'x.ts', line: 1, body: 'Not Claude.' }
        }
      ],
      issueComments: [
        {
          login: 'someone',
          at: minutesAfterStart(-70),
          details: { html_url: 'https://github.com/c/9', ...summaryBody }
        },
        {
          login: summaryBot,
          at: minutesAfterStart(-60),
          details: { html_url: 'https://github.com/c/3', ...summaryBody }
        }
      ]
    })
    expect(status).toBe(0)
    expect(context).toContain('# Repository rules for this review')
    expect(context).toContain(
      'apps/web/src/lib/dictionary/api.ts:18, on commit abc1234 (https://github.com/c/1): **The token is logged.**'
    )
    expect(context).toContain('apps/dictionary-api/src/app.ts:9 (outdated: the code there changed)')
    expect(context).toContain(
      'Summary comment (https://github.com/c/3): ## Claude review Reviewed abc1234.'
    )
    expect(context).not.toContain('Not Claude.')
    expect(context).not.toContain('https://github.com/c/9')
  })

  test('pass on the summary comment to update in place, and give replies to @claude requests as context only', async () => {
    const { status, context, outputs } = await runFindings({
      issueComments: [
        {
          login: summaryBot,
          at: minutesAfterStart(-60),
          details: { id: 99, html_url: 'https://github.com/c/3', ...summaryBody }
        },
        {
          login: bot,
          at: minutesAfterStart(-30),
          details: { id: 100, html_url: 'https://github.com/c/4', ...requestReply }
        }
      ],
      reviewComments: [
        {
          login: bot,
          at: minutesAfterStart(-20),
          details: {
            in_reply_to_id: 11,
            html_url: 'https://github.com/c/5',
            path: 'x.ts',
            line: 3,
            body: 'Fixed in abc1234.'
          }
        }
      ]
    })
    expect(status).toBe(0)
    expect(outputs).toBe('summary_id=99\n')
    expect(context).toContain('Write the summary to tmp/review-summary.md')
    expect(context).toContain('updates the summary comment above (https://github.com/c/3) in place')
    expect(context).toContain('Summary comment (https://github.com/c/3)')
    expect(context).toContain('# Replies to @claude requests')
    expect(context).toContain('- https://github.com/c/4: Done: I renamed the helper in abc1234.')
    expect(context).toContain('- https://github.com/c/5: Fixed in abc1234.')
    expect(context).not.toContain('Summary comment (https://github.com/c/4)')
    expect(context).not.toContain('x.ts:3')
  })

  test('have the workflow post a new summary when there is none, and never edit the latest comment', async () => {
    const { context, outputs } = await runFindings({
      issueComments: [
        {
          login: bot,
          at: minutesAfterStart(-30),
          details: { id: 100, html_url: 'https://github.com/c/4', ...requestReply }
        }
      ]
    })
    expect(outputs).toBe('summary_id=\n')
    expect(context).toContain("posts it as this pull request's summary comment")
    expect(context).toContain('None: this is the first review of this pull request.')
    expect(context).not.toMatch(/--edit-last|gh pr comment|gh api/)
  })

  test('say when this is the first review', async () => {
    const { status, context } = await runFindings({})
    expect(status).toBe(0)
    expect(context).toContain('None: this is the first review of this pull request.')
    expect(context).not.toContain('# Replies to @claude requests')
  })

  test("fail the job when they can't be read", async () => {
    const { status, output } = await runFindings({ status: 403 })
    expect(output).toContain('::error')
    expect(status).not.toBe(0)
  })
})

describe("the review's summary", () => {
  const postIndex = steps.findIndex(step => step.name === "Post the review's summary")
  const post = steps[postIndex]
  const summary = `${summaryBody.body}\n`
  const runPost = (summaryId: string, file: string | undefined, status = 201) =>
    runNodeStep(
      post,
      {
        PR_NUMBER: pr,
        GITHUB_REPOSITORY: repository,
        SUMMARY_ID: summaryId,
        SUMMARY_FILE:
          file === undefined ? join(tmpdir(), 'no-such-folder', 'summary.md') : 'summary.md'
      },
      (_, method) => (method === 'GET' ? undefined : { status, body: {} }),
      file === undefined ? {} : { 'summary.md': file }
    )

  test('is posted by the workflow, between the review and its guard, with the job token', () => {
    expect(postIndex).toBeGreaterThan(reviewIndex)
    expect(postIndex).toBeLessThan(guardIndex)
    expect(post.if).toContain(`steps.${review.id}.outcome == 'success'`)
    expect(post.env).toMatchObject({
      GITHUB_TOKEN: '${{ github.token }}',
      SUMMARY_ID: '${{ steps.earlier.outputs.summary_id }}',
      SUMMARY_FILE: 'tmp/review-summary.md'
    })
    expect(steps.find(step => step.env?.CONTEXT_FILE !== undefined)?.id).toBe('earlier')
    expect(readWorkflow('.github/workflows/code-review.yml').jobs.review.permissions).toMatchObject(
      {
        contents: 'read',
        'pull-requests': 'write'
      }
    )
    const startIndex = steps.findIndex(step => step.run?.includes('REVIEW_STARTED_AT='))
    expect(steps[startIndex].run).toContain('rm -f tmp/review-summary.md')
  })

  test('updates the earlier summary comment in place', async () => {
    const { status, requests } = await runPost('99', summary, 200)
    expect(status).toBe(0)
    expect(requests).toEqual([
      {
        method: 'PATCH',
        path: `/repos/${repository}/issues/comments/99`,
        body: JSON.stringify({ body: summaryBody.body })
      }
    ])
  })

  test('posts a new summary comment when there is none', async () => {
    const { status, requests } = await runPost('', summary)
    expect(status).toBe(0)
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      `POST /repos/${repository}/issues/${pr}/comments`
    ])
  })

  test.each([
    ['without its heading', 'Reviewed abc1234.\n\nNo new findings.', "doesn't start with"],
    ['too long for a comment', `${summaryBody.body}\n${'x'.repeat(60_001)}`, '60000']
  ])('refuses a summary %s, and posts nothing', async (_, file, message) => {
    const { status, output, requests } = await runPost('99', file)
    expect(status).not.toBe(0)
    expect(output).toContain(message)
    expect(requests).toEqual([])
  })

  test('fails when GitHub refuses the comment', async () => {
    const { status, output } = await runPost('99', summary, 403)
    expect(status).not.toBe(0)
    expect(output).toContain('403')
  })

  test('warns and posts nothing when Claude wrote no summary', async () => {
    const { status, output, requests } = await runPost('99', undefined)
    expect(status).toBe(0)
    expect(output).toContain('::warning')
    expect(requests).toEqual([])
  })
})
