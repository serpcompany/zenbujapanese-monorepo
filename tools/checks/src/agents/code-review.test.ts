import { describe, expect, test } from 'vitest'
import {
  bot,
  guard,
  guardIndex,
  lastVerdict,
  post,
  postSummary,
  pr,
  repository,
  review,
  reviewIndex,
  steps,
  summaryBody,
  summaryBot,
  workflowPath
} from './code-review-support'
import { allowedTools, type Route, readRepositoryFile, readWorkflow, runNodeStep } from './workflow'

const workflow = readWorkflow(workflowPath)
const claudeArgs = String(review?.with?.claude_args ?? '')
const skill = readRepositoryFile('.claude/skills/pr-review/SKILL.md')
const skillTools = (/^allowed-tools:\s*(.+)$/m.exec(skill)?.[1] ?? '')
  .split(',')
  .map(tool => tool.trim())
  .filter(Boolean)

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

  test('checks afterwards that a review ran and was posted, from when it started', () => {
    expect(guardIndex).toBe(steps.length - 1)
    expect(guard.name).toBe('Fail unless a review ran and was posted')
    expect(guard.shell).toBe('node {0}')
    expect(guard.env).toMatchObject({
      EXECUTION_FILE: `\${{ steps.retry.outputs.execution_file || steps.${review.id}.outputs.execution_file }}`,
      RETRY_OUTCOME: '${{ steps.retry.outcome }}',
      GITHUB_TOKEN: '${{ github.token }}',
      REVIEW_BOT: bot,
      SUMMARY_BOT: summaryBot
    })
    expect(Object.values(guard.env ?? {}).join(' ')).not.toContain('steps.verdict')
    const startIndex = steps.findIndex(step => step.run?.includes('REVIEW_STARTED_AT='))
    expect(startIndex).toBeGreaterThan(-1)
    expect(startIndex).toBeLessThan(reviewIndex)
  })
})

describe('a pull request that changes the review workflow', () => {
  const [find] = workflow.jobs.changes.steps ?? []
  const workflowRef = `${repository}/${workflowPath}@refs/pull/${pr}/merge`
  const page = (...names: string[]) => names.map(filename => ({ filename, status: 'modified' }))
  const filesOn =
    (pages: Record<string, unknown>[][]): Route =>
    url => {
      if (url.pathname !== `/repos/${repository}/pulls/${pr}/files`) return undefined
      const number = Number(url.searchParams.get('page') ?? '1')
      const nextPage =
        number < pages.length ? `${url.pathname}?per_page=100&page=${number + 1}` : undefined
      return { status: 200, body: pages[number - 1], nextPage }
    }
  const findOut = async (route: Route) => {
    const run = await runNodeStep(
      find,
      {
        GITHUB_REPOSITORY: repository,
        GITHUB_WORKFLOW_REF: workflowRef,
        PR_NUMBER: pr,
        GITHUB_OUTPUT: 'output.txt'
      },
      route,
      { 'output.txt': '' }
    )
    return { ...run, outputs: run.files['output.txt'] }
  }

  test('is found by a first job that reads the file list and checks nothing out', () => {
    expect(Object.keys(workflow.jobs)).toEqual(['changes', 'review'])
    const { changes } = workflow.jobs
    expect(changes.if).toBe(
      "${{ !github.event.pull_request.draft && github.event.pull_request.user.type != 'Bot' }}"
    )
    expect(changes.permissions).toEqual({ 'pull-requests': 'read' })
    expect(changes.steps).toHaveLength(1)
    expect(find.uses).toBeUndefined()
    expect(find.shell).toBe('node {0}')
    expect(find.env).toEqual({
      GITHUB_TOKEN: '${{ github.token }}',
      PR_NUMBER: '${{ github.event.pull_request.number }}'
    })
    expect(readRepositoryFile(workflowPath)).toContain(
      'reviewable: ${{ steps.files.outputs.reviewable }}'
    )
  })

  test('is skipped by the review job, not failed by it', () => {
    expect(workflow.jobs.review.needs).toBe('changes')
    expect(workflow.jobs.review.if).toBe("needs.changes.outputs.reviewable == 'true'")
  })

  test.each([
    ['changes it', [page('docs/a.md', workflowPath)]],
    ['changes it on a later page of files', [page('docs/a.md'), page(workflowPath)]],
    [
      'renames it',
      [[{ filename: '.github/workflows/review.yml', previous_filename: workflowPath }]]
    ]
  ])('gets no review and a notice saying a person reviews it, when it %s', async (_, pages) => {
    const { status, output, outputs } = await findOut(filesOn(pages))
    expect(status).toBe(0)
    expect(outputs).toBe('reviewable=false\n')
    expect(output).toContain("::notice title=Claude doesn't review this pull request::")
    expect(output).toContain(
      `This pull request changes ${workflowPath}, and Claude's review can't run on a pull request that changes the review workflow`
    )
    expect(output).toContain('A person reviews this pull request')
  })

  test('is told apart from one that leaves the workflow alone, which is reviewed', async () => {
    const { status, output, outputs, requests } = await findOut(
      filesOn([page('docs/a.md', '.github/workflows/web.yml'), page('apps/web/worker.ts')])
    )
    expect(status).toBe(0)
    expect(outputs).toBe('reviewable=true\n')
    expect(output).not.toContain('::notice')
    expect(requests).toHaveLength(2)
  })

  test("fails when the pull request's files can't be read", async () => {
    const { status, output, outputs } = await findOut(() => ({ status: 403, body: {} }))
    expect(status).not.toBe(0)
    expect(output).toContain('::error')
    expect(outputs).toBe('')
  })
})

describe("the review's summary", () => {
  const postIndex = steps.indexOf(post)
  const summary = `${summaryBody.body}\n`

  test('is posted by the workflow, between the review and its guard, with the job token', () => {
    expect(postIndex).toBeGreaterThan(steps.indexOf(lastVerdict))
    expect(postIndex).toBeLessThan(guardIndex)
    expect(post.if).toContain(`steps.${review.id}.outcome == 'success'`)
    expect(post.env).toMatchObject({
      GITHUB_TOKEN: '${{ github.token }}',
      SUMMARY_ID: '${{ steps.earlier.outputs.summary_id }}',
      SUMMARY_FILE: 'tmp/review-summary.md',
      PROBLEM: `\${{ steps.${lastVerdict.id}.outputs.problem }}`
    })
    expect(workflow.jobs.review.permissions).toMatchObject({
      contents: 'read',
      'pull-requests': 'write'
    })
    const startIndex = steps.findIndex(step => step.run?.includes('REVIEW_STARTED_AT='))
    expect(steps[startIndex].run).toContain('rm -f tmp/review-summary.md')
  })

  test('updates the earlier summary comment in place', async () => {
    const { status, requests } = await postSummary(summary, { id: '99', status: 200 })
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
    const { status, requests } = await postSummary(summary)
    expect(status).toBe(0)
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      `POST /repos/${repository}/issues/${pr}/comments`
    ])
  })

  test('says first, under its heading, when the review was incomplete', async () => {
    const problem =
      'Incomplete: this review read 2 of 61 changed files and did not run its reviewers.'
    const { status, requests } = await postSummary(summary, { id: '99', status: 200, problem })
    expect(status).toBe(0)
    expect(JSON.parse(requests[0].body).body).toBe(
      `## Claude review\n\n**${problem}**\n\nReviewed abc1234, round 1.\nRead 4 of 4 changed files.\n\nNo new findings.`
    )
  })

  test.each([
    ['without its heading', 'Reviewed abc1234.\n\nNo new findings.', "doesn't start with"],
    ['too long for a comment', `${summaryBody.body}\n${'x'.repeat(60_001)}`, '60000']
  ])('refuses a summary %s, and posts nothing', async (_, file, message) => {
    const { status, output, requests } = await postSummary(file, { id: '99' })
    expect(status).not.toBe(0)
    expect(output).toContain(message)
    expect(requests).toEqual([])
  })

  test('fails when GitHub refuses the comment', async () => {
    const { status, output } = await postSummary(summary, { id: '99', status: 403 })
    expect(status).not.toBe(0)
    expect(output).toContain('403')
  })

  test('warns and posts nothing when Claude wrote no summary', async () => {
    const { status, output, requests } = await postSummary(undefined, { id: '99' })
    expect(status).toBe(0)
    expect(output).toContain('::warning')
    expect(requests).toEqual([])
  })
})
