import { describe, expect, test } from 'vitest'
import {
  claudeResult,
  executionLog,
  expectFailureUnlessClaudeFinished,
  minutesAfter
} from './guards'
import {
  allowedTools,
  claudeStep,
  disallowedTools,
  guardAfter,
  type Route,
  readWorkflow,
  runNodeStep
} from './workflow'

const workflow = readWorkflow('.github/workflows/claude.yml')
const job = workflow.jobs.claude
const steps = job.steps ?? []
const { step: claude, index: claudeIndex } = claudeStep(steps)
const claudeArgs = String(claude?.with?.claude_args ?? '')
const rules = steps.find(step => step.run?.includes('claude-rules.md'))?.run ?? ''
const { step: guard, index: guardIndex } = guardAfter(steps, claude)

const repository = 'serpcompany/zenbujapanese-monorepo'
const bot = 'claude[bot]'
const startedAt = '2026-10-05T10:00:00Z'
const minutesAfterStart = (minutes: number) => minutesAfter(startedAt, minutes)

interface Commit {
  sha: string
  author?: string
  at?: string
  files?: string[]
}

interface Request {
  onPullRequest?: boolean
  commits?: Commit[]
}

function github(commits: Commit[]): Route {
  return url => {
    if (url.pathname === `/repos/${repository}/pulls/7`) {
      return { status: 200, body: { head: { ref: 'fl/feature', sha: 'headsha' } } }
    }
    if (url.pathname === `/repos/${repository}/commits`) {
      return {
        status: 200,
        body: commits.map(item => ({
          sha: item.sha,
          commit: {
            author: { name: item.author ?? bot, date: item.at ?? minutesAfterStart(5) },
            message: 'Rename the helper'
          }
        }))
      }
    }
    const detail = new RegExp(`^/repos/${repository}/commits/([^/]+)$`).exec(url.pathname)
    const commit = commits.find(item => item.sha === detail?.[1])
    if (!commit) return undefined
    return { status: 200, body: { files: (commit.files ?? []).map(filename => ({ filename })) } }
  }
}

function runGuard(log: unknown, { onPullRequest = true, commits = [] }: Request = {}) {
  const { env, files } = executionLog(log)
  return runNodeStep(
    guard,
    {
      ...env,
      CLAUDE_BOT: bot,
      CLAUDE_BRANCH: onPullRequest ? '' : 'claude/issue-12-20261005',
      CLAUDE_STARTED_AT: startedAt,
      ENTITY_NUMBER: onPullRequest ? '7' : '12',
      GITHUB_REPOSITORY: repository,
      IS_PR: onPullRequest ? 'true' : 'false'
    },
    github(commits),
    files
  )
}

const result = claudeResult({
  num_turns: 18,
  duration_ms: 240_000,
  total_cost_usd: 0.9,
  modelUsage: { 'claude-sonnet-5-5': {} },
  result: 'Renamed the helper and pushed abc1234.'
})
const replied = [
  {
    type: 'assistant',
    message: {
      content: [
        { type: 'tool_use', id: 'toolu_reply', name: 'mcp__github_comment__update_claude_comment' }
      ]
    }
  },
  {
    type: 'user',
    message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_reply', is_error: false }] }
  }
]
const pushedByClaude: Commit = { sha: 'abc1234aaa' }

describe('the Claude workflow', () => {
  test('answers @claude in comments, reviews, and issues, but never a bot, so its own comments never start it again', () => {
    expect(Object.keys(workflow.on).sort()).toEqual([
      'issue_comment',
      'issues',
      'pull_request_review',
      'pull_request_review_comment'
    ])
    expect(job.if).toContain("github.event.sender.type != 'Bot'")
    expect(job.if?.match(/@claude/g)?.length).toBeGreaterThanOrEqual(5)
  })

  test('answers only the owners, members, and collaborators, before it checks out or installs anything', () => {
    const triggers = ['comment', 'comment', 'review', 'issue'].map(
      entity => `github.event.${entity}.author_association`
    )
    for (const association of new Set(triggers)) expect(job.if).toContain(association)
    expect(job.if?.match(/fromJSON\('\["OWNER","MEMBER","COLLABORATOR"\]'\)/g)).toHaveLength(4)
  })

  test("runs one request per issue or pull request at a time, queued in the job so comments that don't ask never displace one", () => {
    expect(workflow.concurrency).toBeUndefined()
    expect(job.concurrency?.group).toContain(
      'github.event.issue.number || github.event.pull_request.number'
    )
    expect(job.concurrency?.['cancel-in-progress']).toBe(false)
  })

  test("keeps the checkout's token out of the working tree, and runs no install script or pnpmfile from the pull request", () => {
    const checkout = steps.find(step => step.uses?.startsWith('actions/checkout'))
    expect(checkout?.with?.['persist-credentials']).toBe(false)
    expect(
      steps.some(
        step => step.run === 'pnpm install --frozen-lockfile --ignore-scripts --ignore-pnpmfile'
      )
    ).toBe(true)
  })

  test('branches from main, installs every package as the Repository workflow does, and never pushes to main', () => {
    expect(job.env?.BASE_BRANCH).toBe('main')
    expect(claude.with?.base_branch).toBe('${{ env.BASE_BRANCH }}')
    expect(steps.find(step => step.uses?.startsWith('pnpm/action-setup'))?.with).toEqual({
      package_json_file: 'package.json'
    })
    expect(rules).toContain('Never push to main.')
    expect(claudeArgs).toContain('--append-system-prompt-file ${{ runner.temp }}/claude-rules.md')
  })

  test('follows the repository rules, and checks a change before pushing it', () => {
    for (const file of ['AGENTS.md', 'ARCHITECTURE.md', 'docs/agents/code.md', 'CONTEXT.md']) {
      expect(rules).toContain(file)
    }
    expect(rules).toContain('run `pnpm verify`, then `pnpm --filter <package> check`')
    expect(rules).toContain("A Swift change can't be built or tested on this runner")
    expect(allowedTools(claude)).toEqual(
      expect.arrayContaining([
        'Bash(pnpm verify)',
        'Bash(pnpm verify *)',
        'Bash(pnpm check)',
        'Bash(pnpm --filter * check)',
        'Glob',
        'Grep'
      ])
    )
  })

  test('stages files by path only, since the action resets .claude/ on a pull request and a blanket add would commit that reset', () => {
    const refused = disallowedTools(claude)
    for (const blanket of [
      'git add -A',
      'git add --all',
      'git add .',
      'git add -u',
      'git commit -a'
    ]) {
      expect(refused.some(tool => tool.startsWith(`Bash(${blanket}`))).toBe(true)
    }
    expect(rules).toContain('Stage only the files you changed, by path')
  })

  test('keeps subagents in the foreground, gives the checks time to finish, and caps the turns', () => {
    expect(claude.env?.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS).toBe('1')
    expect(claude.env?.BASH_DEFAULT_TIMEOUT_MS).toBe('900000')
    expect(claudeArgs).toContain('--max-turns 60')
    expect(claudeArgs).toMatch(/--model claude-/)
    expect(claudeArgs).toContain('--strict-mcp-config')
  })

  test('checks the outcome afterwards, from when Claude started', () => {
    expect(guardIndex).toBeGreaterThan(claudeIndex)
    expect(guard.env).toMatchObject({ GITHUB_TOKEN: '${{ github.token }}', CLAUDE_BOT: bot })
    const startIndex = steps.findIndex(step => step.run?.includes('CLAUDE_STARTED_AT='))
    expect(startIndex).toBeGreaterThan(-1)
    expect(startIndex).toBeLessThan(claudeIndex)
  })
})

describe('the fork check before an @claude request', () => {
  const sourceIndex = steps.findIndex(step => step.name === 'Skip a pull request from a fork')
  const source = steps[sourceIndex]
  const runSource = (isPullRequest: boolean, pullRequest: { status: number; body: unknown }) =>
    runNodeStep(
      source,
      {
        ENTITY_NUMBER: '7',
        GITHUB_ENV: 'env.txt',
        GITHUB_REPOSITORY: repository,
        IS_PR: isPullRequest ? 'true' : 'false'
      },
      url => (url.pathname === `/repos/${repository}/pulls/7` ? pullRequest : undefined),
      { 'env.txt': '' }
    )
  const fromRepository = (name: string | null) => ({
    status: 200,
    body: { head: { repo: name === null ? null : { full_name: name } } }
  })

  test('runs before anything is checked out, and every later step waits for it', () => {
    const checkoutIndex = steps.findIndex(step => step.uses?.startsWith('actions/checkout'))
    expect(sourceIndex).toBeGreaterThan(-1)
    expect(sourceIndex).toBeLessThan(checkoutIndex)
    expect(source.env?.GITHUB_TOKEN).toBe('${{ github.token }}')
    for (const step of steps.slice(sourceIndex + 1))
      expect(step.if).toContain("env.ANSWER == 'true'")
  })

  test.each<[string, boolean, { status: number; body: unknown }, string]>([
    ['an issue', false, fromRepository('someone/fork'), 'ANSWER=true\n'],
    [
      "a pull request from this repository's branch",
      true,
      fromRepository(repository),
      'ANSWER=true\n'
    ],
    [
      'a pull request from a fork',
      true,
      fromRepository('someone/zenbujapanese-monorepo'),
      'ANSWER=false\n'
    ],
    ['a pull request from a deleted fork', true, fromRepository(null), 'ANSWER=false\n']
  ])('decides whether to answer on %s', async (_, isPullRequest, pullRequest, decision) => {
    const { status, files, requests } = await runSource(isPullRequest, pullRequest)
    expect(status).toBe(0)
    expect(files['env.txt']).toBe(decision)
    expect(requests).toHaveLength(isPullRequest ? 1 : 0)
  })

  test("fails, and answers nothing, when it can't read the pull request", async () => {
    const { status, output, files } = await runSource(true, { status: 404, body: {} })
    expect(status).not.toBe(0)
    expect(output).toContain('404')
    expect(files['env.txt']).toBe('')
  })
})

describe('the check after an @claude request', () => {
  test('fails unless Claude finished: no log, no result, an error, or subagents still running', async () => {
    await expectFailureUnlessClaudeFinished(log => runGuard(log), result)
  })

  test('passes when Claude answered in its comment', async () => {
    const { status, output } = await runGuard([...replied, result()])
    expect(output).toContain('Claude replied in its comment.')
    expect(output).not.toContain('::error')
    expect(status).toBe(0)
  })

  test('passes when Claude pushed to the pull request and replied', async () => {
    const { status, output } = await runGuard([...replied, result()], {
      commits: [pushedByClaude]
    })
    expect(output).toContain('pushed 1 commit(s) to fl/feature and replied in its comment')
    expect(output).not.toContain('::warning')
    expect(status).toBe(0)
  })

  test('ignores commits by anyone else, or from before the request', async () => {
    const { status, output } = await runGuard([result({ result: "I couldn't reproduce it." })], {
      commits: [
        { sha: 'personal1', author: 'Francis LaBounty' },
        { sha: 'earlier1', at: minutesAfterStart(-10) }
      ]
    })
    expect(output).toContain('Claude neither pushed a commit nor updated its comment.')
    expect(output).toContain("I couldn't reproduce it.")
    expect(status).not.toBe(0)
  })

  test('warns when Claude changed a file the action resets on a pull request, and when it pushed without replying', async () => {
    const { status, output } = await runGuard([result()], {
      commits: [{ sha: 'abc1234aaa', files: ['.claude/settings.json'] }]
    })
    expect(output).toContain('Claude changed files the action resets')
    expect(output).toContain('.claude/settings.json in abc1234')
    expect(output).toContain("Claude didn't reply")
    expect(status).toBe(0)
  })

  test("reads the branch Claude made for an issue, not a pull request's", async () => {
    const { status, output } = await runGuard([...replied, result()], {
      onPullRequest: false,
      commits: [pushedByClaude]
    })
    expect(output).toContain('pushed 1 commit(s) to claude/issue-12-20261005')
    expect(status).toBe(0)
  })
})
