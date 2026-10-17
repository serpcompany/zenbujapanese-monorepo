import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  bot,
  environment,
  firstVerdict,
  github,
  guard,
  guardIndex,
  lastVerdict,
  outputsOf,
  type PullRequest,
  pr,
  repository,
  retry,
  review,
  reviewIndex,
  steps,
  summaryBot,
  workflowPath
} from './code-review-support'
import { scratchFolder } from './scratch'
import { allowedTools, readRepositoryFile, readWorkflow, runNodeStep } from './workflow'

const workflow = readWorkflow(workflowPath)
const claudeArgs = String(review?.with?.claude_args ?? '')
const skill = readRepositoryFile('.claude/skills/pr-review/SKILL.md')
const skillTools = (/^allowed-tools:\s*(.+)$/m.exec(skill)?.[1] ?? '')
  .split(',')
  .map(tool => tool.trim())
  .filter(Boolean)
const [find] = workflow.jobs.changes.steps ?? []
const take = steps.find(step => step.env?.STEP === 'scripts')
const inline = find.run ?? ''

describe('the Code review workflow', () => {
  test('has the skill read the issue and every changed file, and say how much it read', () => {
    expect(skillTools).toContain('Bash(gh issue view:*)')
    expect(skill).toContain('closingIssuesReferences,changedFiles')
    expect(skill).toContain('`Read <N> of <M> changed files.`')
    expect(skill).toContain('`Not read:`')
    expect(skill).toContain('`**blocking**` or\n  `**suggestion**`')
  })

  test('has the skill read the change in CI from the directory the workflow writes', () => {
    expect(skill).toContain('in CI the workflow has written it to a directory')
    expect(skill).toContain('with `offset` and `limit`, and not `gh pr diff`')
    expect(skill).toContain("In CI your instructions already hold each\n  issue's text.")
    expect(skill).toContain('with the Agent tool (Task in older versions)')
    expect(allowedTools(review)).toContain('Bash(gh pr diff:*)')
  })

  test('has the skill find the issue of a pull request into another branch in its description', () => {
    expect(skill).toContain('GitHub links an issue only on a pull request into the default branch')
    expect(skill).toContain('closing keyword in its description')
  })

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

  test("lets claude[bot]'s @claude fixes and serp-agent[bot]'s pushes start a review", () => {
    expect(review.with?.allowed_bots).toBe('claude[bot],serp-agent[bot]')
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

  test("gives Claude and its subagents the base branch's rules, in files outside the checkout", () => {
    const context = steps.find(step => step.env?.CONTEXT_FILE !== undefined)
    expect(context?.env?.BASE_REF).toBe('${{ github.event.pull_request.base.ref }}')
    expect(context?.env?.RULES?.split(' ')).toEqual(
      expect.arrayContaining(['AGENTS.md', 'ARCHITECTURE.md', 'docs/agents/code.md', 'CONTEXT.md'])
    )
    expect(steps.indexOf(context ?? {})).toBeLessThan(reviewIndex)
    expect(claudeArgs).toContain('--append-system-prompt-file ${{ runner.temp }}/review-context.md')
    expect(claudeArgs).toContain(
      '--append-subagent-system-prompt-file ${{ runner.temp }}/review-reviewers-context.md'
    )
  })

  test('gives each attempt a time limit that leaves the job time to post what it has', () => {
    const [first, second] = [review, retry].map(step => Number(step['timeout-minutes']))
    const slowestAttemptMeasured = 329 / 60
    expect(first).toBeGreaterThan(2 * slowestAttemptMeasured)
    expect(second).toBeGreaterThan(1.5 * slowestAttemptMeasured)
    expect(first + second).toBeLessThanOrEqual(Number(workflow.jobs.review['timeout-minutes']) - 8)
  })

  test('names the pull request and the two bots once, for every step of the job', () => {
    expect(workflow.jobs.review.env).toEqual({
      HAS_REVIEW_TOKEN: "${{ secrets.CLAUDE_CODE_OAUTH_TOKEN != '' }}",
      PR_NUMBER: '${{ github.event.pull_request.number }}',
      REVIEW_BOT: bot,
      SUMMARY_BOT: summaryBot
    })
    const named = Object.keys(workflow.jobs.review.env ?? {})
    for (const step of steps) {
      expect(Object.keys(step.env ?? {}).filter(name => named.includes(name))).toEqual([])
    }
  })

  test('checks afterwards that a review ran and was posted, from when it started', () => {
    expect(guardIndex).toBe(steps.length - 1)
    expect(guard.name).toBe('Fail unless a review ran and was posted')
    expect(guard.shell).toBe('node {0}')
    expect(guard.env).toMatchObject({
      STEP: 'check',
      EXECUTION_FILE: `\${{ steps.retry.outputs.execution_file || steps.${review.id}.outputs.execution_file }}`,
      RETRY_OUTCOME: '${{ steps.retry.outcome }}',
      MEASURED: `\${{ steps.${firstVerdict.id}.outcome }} \${{ steps.${lastVerdict.id}.outcome }}`,
      GITHUB_TOKEN: '${{ github.token }}'
    })
    const startIndex = steps.findIndex(step => step.run?.includes('REVIEW_STARTED_AT='))
    expect(startIndex).toBeGreaterThan(-1)
    expect(startIndex).toBeLessThan(reviewIndex)
  })
})

describe('the script the workflow runs itself', () => {
  const ownSteps = [find, ...steps].filter(step => step.shell === 'node {0}')

  test('is one script for every step, so each asks GitHub the same way', () => {
    expect(ownSteps.map(step => step.env?.STEP)).toEqual([
      'files',
      'scripts',
      'first',
      'last',
      'check'
    ])
    for (const step of ownSteps) expect(step.run).toBe(inline)
    expect(inline.match(/\bfetch\(/g)).toHaveLength(1)
    expect(inline).toContain('AbortSignal.timeout(')
    expect(inline).toContain('const secondsBetweenTries = [5, 15, 45]')
  })

  test('loads no code from the runner, where Claude could have written some', () => {
    const required = [...inline.matchAll(/require\('([^']+)'\)/g)].map(found => found[1])
    expect(required).toEqual(['node:fs', 'node:path'])
    expect(inline).not.toMatch(/\bimport\(|\beval\(|new Function|child_process/)
    for (const step of steps.slice(reviewIndex).filter(each => each.run !== undefined)) {
      expect(step.shell).toBe('node {0}')
      expect(['first', 'last', 'check']).toContain(step.env?.STEP)
    }
    expect(steps.filter(step => /^node /.test(step.run ?? ''))).toHaveLength(1)
  })
})

describe('a pull request that changes the review workflow', () => {
  const workflowRef = `${repository}/${workflowPath}@refs/pull/${pr}/merge`
  const page = (...names: string[]) => names.map(filename => ({ filename, status: 'modified' }))
  const findOut = async (pullRequest: PullRequest, more: Record<string, string> = {}) => {
    const run = await runNodeStep(
      find,
      { ...environment, GITHUB_WORKFLOW_REF: workflowRef, GITHUB_OUTPUT: 'output.txt', ...more },
      github(pullRequest),
      { 'output.txt': '' }
    )
    return { ...run, outputs: outputsOf(run.files['output.txt']) }
  }

  test('is found by a first job that reads the file list and checks nothing out', () => {
    expect(Object.keys(workflow.jobs)).toEqual(['changes', 'review'])
    const { changes } = workflow.jobs
    expect(changes.if).toBe(
      `\${{ !github.event.pull_request.draft && !contains(fromJSON('["claude[bot]","dependabot[bot]","renovate[bot]"]'), github.event.pull_request.user.login) }}`
    )
    expect(changes.permissions).toEqual({ 'pull-requests': 'read' })
    expect(changes.outputs).toEqual({ reviewable: '${{ steps.files.outputs.reviewable }}' })
    expect(changes.steps).toHaveLength(1)
    expect(find.id).toBe('files')
    expect(find.uses).toBeUndefined()
    expect(find.env).toEqual({
      STEP: 'files',
      GITHUB_TOKEN: '${{ github.token }}',
      PR_NUMBER: '${{ github.event.pull_request.number }}',
      DEADLINE_SECONDS: '300'
    })
  })

  test('is skipped by the review job, not failed by it', () => {
    expect(workflow.jobs.review.needs).toBe('changes')
    expect(workflow.jobs.review.if).toBe("needs.changes.outputs.reviewable == 'true'")
  })

  test.each<[string, PullRequest]>([
    ['changes it', { files: page('docs/a.md', workflowPath) }],
    [
      'changes it on a later page of files',
      { files: page('docs/a.md', workflowPath), filesPerPage: 1 }
    ],
    [
      'renames it',
      { files: [{ filename: '.github/workflows/review.yml', previous_filename: workflowPath }] }
    ]
  ])('gets no review and a notice saying a person reviews it, when it %s', async (_, pullRequest) => {
    const { status, output, outputs } = await findOut(pullRequest)
    expect(status).toBe(0)
    expect(outputs).toEqual({ reviewable: 'false' })
    expect(output).toContain("::notice title=Claude doesn't review this pull request::")
    expect(output).toContain(
      `This pull request changes ${workflowPath}, and Claude's review can't run on a pull request that changes the review workflow`
    )
    expect(output).toContain('A person reviews this pull request')
  })

  test('is told apart from one that leaves the workflow alone, whatever its files are named', async () => {
    const { status, output, outputs, requests } = await findOut({
      files: page(
        'docs/a.md',
        '.github/workflows/web.yml',
        `y\n${workflowPath}`,
        `docs/${workflowPath}`,
        `${workflowPath}.md`
      ),
      filesPerPage: 3
    })
    expect(status).toBe(0)
    expect(outputs).toEqual({ reviewable: 'true' })
    expect(output).not.toContain('::notice')
    expect(requests).toHaveLength(2)
  })

  test('is never the red check: when GitHub stays unreachable it warns and lets the review try', async () => {
    const refused = await findOut({ status: 403 })
    expect(refused.status).toBe(0)
    expect(refused.outputs).toEqual({ reviewable: 'true' })
    expect(refused.output).toContain(
      "::warning title=Couldn't tell whether the pull request changes the review workflow::GET /pulls/7/files returned 403"
    )
    expect(refused.output).toContain('The review is tried all the same')
    expect(refused.requests).toHaveLength(1)
    const unnamed = await findOut({ files: page(workflowPath) }, { GITHUB_WORKFLOW_REF: '' })
    expect(unnamed.status).toBe(0)
    expect(unnamed.outputs).toEqual({ reviewable: 'true' })
    expect(unnamed.output).toContain('::warning')
  })

  test('is never cancelled at its time limit: well inside it, it warns and lets the review try', async () => {
    const limit = Number(workflow.jobs.changes['timeout-minutes']) * 60
    expect(Number(find.env?.DEADLINE_SECONDS)).toBeLessThanOrEqual(limit / 2)
    const late = await findOut(
      { unavailableFor: 1, unavailable: { status: 502, headers: { 'retry-after': '30' } } },
      { DEADLINE_SECONDS: '1' }
    )
    expect(late.status).toBe(0)
    expect(late.outputs).toEqual({ reviewable: 'true' })
    expect(late.output).toContain(
      "::warning title=Couldn't tell whether the pull request changes the review workflow::GitHub hadn't listed the pull request's files after 1 seconds, so nothing says"
    )
    expect(late.requests).toHaveLength(1)
  })
})

describe('asking GitHub, from any step the workflow runs itself', () => {
  const workflowRef = `${repository}/${workflowPath}@refs/pull/${pr}/merge`
  const ask = async (pullRequest: PullRequest) => {
    const began = Date.now()
    const run = await runNodeStep(
      find,
      { ...environment, GITHUB_WORKFLOW_REF: workflowRef, GITHUB_OUTPUT: 'output.txt' },
      github({ files: [{ filename: workflowPath }], ...pullRequest }),
      { 'output.txt': '' }
    )
    return {
      ...run,
      outputs: outputsOf(run.files['output.txt']),
      seconds: (Date.now() - began) / 1000
    }
  }
  const inASecond = () => String(Math.ceil(Date.now() / 1000) + 1)

  test('is tried again when GitHub is unavailable, after the wait it asks for', async () => {
    const run = await ask({ unavailableFor: 2 })
    expect(run.outputs).toEqual({ reviewable: 'false' })
    expect(run.requests).toHaveLength(3)
    expect(run.seconds).toBeGreaterThan(1.9)
  })

  test.concurrent.each<[string, PullRequest]>([
    ['GitHub names no wait', { unavailableFor: 1, unavailable: { status: 502 } }],
    ['GitHub gives no answer', { lostAnswers: 1 }],
    ['an answer is cut short', { lostBodies: 1 }]
  ])('is tried again after five seconds when %s', async (_, pullRequest) => {
    const run = await ask(pullRequest)
    expect(run.outputs).toEqual({ reviewable: 'false' })
    expect(run.requests).toHaveLength(2)
    expect(run.seconds).toBeGreaterThan(4.9)
  })

  test.each<[string, { status: number; headers: Record<string, string> }]>([
    ['a 429', { status: 429, headers: { 'retry-after': '1' } }],
    [
      'a 403 that says the rate limit is used up',
      { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': inASecond() } }
    ]
  ])('waits out %s, until GitHub says to come back', async (_, unavailable) => {
    const run = await ask({ unavailableFor: 1, unavailable })
    expect(run.status).toBe(0)
    expect(run.outputs).toEqual({ reviewable: 'false' })
    expect(run.requests).toHaveLength(2)
  })

  test.each<[string, { status: number; headers?: Record<string, string> }]>([
    ['a 403 that is a refusal', { status: 403 }],
    ['a 404', { status: 404 }],
    [
      'a rate limit that resets too far off to wait for',
      { status: 429, headers: { 'retry-after': '3600' } }
    ]
  ])('gives up at once on %s', async (_, unavailable) => {
    const run = await ask({ unavailableFor: 1, unavailable })
    expect(run.requests).toHaveLength(1)
    expect(run.output).toContain(`returned ${unavailable.status}`)
    expect(run.outputs).toEqual({ reviewable: 'true' })
  })
})

describe("the review's transcript", () => {
  test('is kept whenever an attempt left a log, whatever came after it, and before the last step', () => {
    const keep = steps.find(step => step.uses?.startsWith('actions/upload-artifact@'))
    expect(keep?.if).toBe(
      `always() && env.HAS_REVIEW_TOKEN == 'true' && steps.${review.id}.outputs.execution_file != ''`
    )
    expect(steps.indexOf(keep ?? {})).toBe(guardIndex - 1)
    expect(String(keep?.with?.path).trim().split('\n')).toEqual([
      guard.env?.EXECUTION_FILE,
      firstVerdict.env?.FIRST_ATTEMPT_LOG,
      firstVerdict.env?.FIRST_ATTEMPT_SUMMARY
    ])
    expect(keep?.with?.['retention-days']).toBe(7)
  })
})

describe("the review's scripts", () => {
  const names = String(take?.env?.SCRIPTS).split(' ')
  const commit = '84976a82c0ffee'
  const takeThem = async (pullRequest: PullRequest) => {
    const runnerTemp = scratchFolder('runner-temp')
    const run = await runNodeStep(
      take ?? {},
      { ...environment, DEFAULT_BRANCH: 'main', RUNNER_TEMP: runnerTemp },
      github({ defaultBranchCommit: commit, ...pullRequest })
    )
    const taken = (name: string) => join(runnerTemp, 'review-scripts', name)
    return { ...run, taken }
  }

  test("are the default branch's copies, taken before the review by the workflow's own script", () => {
    expect(take?.env).toEqual({
      STEP: 'scripts',
      DEFAULT_BRANCH: '${{ github.event.repository.default_branch }}',
      GITHUB_TOKEN: '${{ github.token }}',
      SCRIPTS: 'review-context.mjs review-change.mjs pull-request.mjs'
    })
    expect(steps.indexOf(take ?? {})).toBeLessThan(reviewIndex)
    const context = steps.find(step => step.env?.CONTEXT_FILE !== undefined)
    expect(context?.run).toBe(`node "$RUNNER_TEMP/review-scripts/${names[0]}"`)
  })

  test('are every file they import from each other', () => {
    for (const script of names) {
      const imported = [
        ...readRepositoryFile(`tools/checks/${script}`).matchAll(/from '\.\/([^']+)'/g)
      ].map(found => found[1])
      expect(names, script).toEqual(expect.arrayContaining(imported))
    }
  })

  test('are all read at one commit of the default branch', async () => {
    const run = await takeThem({
      scripts: Object.fromEntries(names.map(name => [name, `${name}\n`]))
    })
    expect(run.status).toBe(0)
    for (const name of names) expect(readFileSync(run.taken(name), 'utf8')).toBe(`${name}\n`)
    expect(run.requests.map(({ path }) => path.replace(`/repos/${repository}`, ''))).toEqual([
      '/commits/main',
      ...names.map(name => `/contents/tools/checks/${name}`)
    ])
    expect(run.output).toContain(`from ${commit} of main`)
  })

  test('are asked for again when GitHub is unavailable', async () => {
    const run = await takeThem({
      scripts: Object.fromEntries(names.map(name => [name, name])),
      unavailableFor: 1
    })
    expect(run.status).toBe(0)
    expect(existsSync(run.taken(names[2]))).toBe(true)
  })

  test('fail the job, naming the file and the commit, when one cannot be had', async () => {
    const run = await takeThem({ scripts: { [names[0]]: 'first' } })
    expect(run.status).not.toBe(0)
    expect(run.output).toContain(
      `::error title=Couldn't fetch the review's scripts::tools/checks/${names[1]} at ${commit} of main: GET /contents/tools/checks/${names[1]} returned 404`
    )
  })
})
