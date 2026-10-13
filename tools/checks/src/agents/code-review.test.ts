import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
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
import { scratchFolder } from './scratch'
import { allowedTools, readRepositoryFile, readWorkflow } from './workflow'

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

describe("the review's scripts", () => {
  const take = steps.find(step => step.run?.includes('"$RUNNER_TEMP/review-scripts/$script"'))
  const scripts = String(take?.env?.SCRIPTS).split(' ')

  test("are the default branch's copies, fetched through the API before the review", () => {
    expect(take?.env).toEqual({
      DEFAULT_BRANCH: '${{ github.event.repository.default_branch }}',
      GH_TOKEN: '${{ github.token }}',
      SCRIPTS: 'review-context.mjs review-change.mjs pull-request.mjs'
    })
    expect(take?.run).toContain(
      'gh api "repos/$GITHUB_REPOSITORY/contents/tools/checks/$script?ref=$DEFAULT_BRANCH"'
    )
    expect(steps.indexOf(take ?? {})).toBeLessThan(reviewIndex)
    for (const step of steps) {
      expect(step.run ?? '').not.toMatch(/node (?!"\$RUNNER_TEMP\/review-scripts\/)/)
    }
  })

  test('are every file they import from each other', () => {
    for (const script of scripts) {
      const imported = [
        ...readRepositoryFile(`tools/checks/${script}`).matchAll(/from '\.\/([^']+)'/g)
      ].map(found => found[1])
      expect(scripts, script).toEqual(expect.arrayContaining(imported))
    }
  })

  test("don't run after Claude, which could have rewritten them", () => {
    for (const step of steps.slice(reviewIndex)) {
      expect(step.run ?? '').not.toMatch(/review-scripts|\bgit /)
    }
  })
})

describe('a pull request that changes the review workflow', () => {
  const [find] = workflow.jobs.changes.steps ?? []
  const jq = (process.env.PATH ?? '').split(':').some(folder => existsSync(join(folder, 'jq')))
  const standInForGh = `#!/usr/bin/env node
const { readFileSync, writeFileSync } = require('node:fs')
const { spawnSync } = require('node:child_process')
const asked = process.argv.slice(2)
const state = JSON.parse(readFileSync(process.env.GH_STATE, 'utf8'))
state.asked.push(asked.join(' '))
const refused = state.refusals > 0
if (refused) state.refusals -= 1
writeFileSync(process.env.GH_STATE, JSON.stringify(state))
if (refused) {
  console.error('gh: Bad Gateway (HTTP 502)')
  process.exit(1)
}
for (const page of state.pages) {
  const filtered = spawnSync('jq', ['-r', asked[asked.indexOf('--jq') + 1]], {
    input: JSON.stringify(page),
    encoding: 'utf8'
  })
  process.stdout.write(filtered.stdout)
}
`
  const page = (...names: string[]) => names.map(filename => ({ filename, status: 'modified' }))
  const findOut = (pages: Record<string, unknown>[][], refusals = 0) => {
    const folder = scratchFolder('stand-in-gh')
    const state = join(folder, 'state.json')
    const output = join(folder, 'output.txt')
    writeFileSync(join(folder, 'gh'), standInForGh)
    chmodSync(join(folder, 'gh'), 0o755)
    writeFileSync(state, JSON.stringify({ pages, refusals, asked: [] }))
    writeFileSync(output, '')
    const run = spawnSync('bash', ['-e', '-c', find.run ?? ''], {
      encoding: 'utf8',
      env: {
        PATH: `${folder}:${dirname(process.execPath)}:${process.env.PATH ?? ''}`,
        GH_STATE: state,
        GITHUB_OUTPUT: output,
        GITHUB_REPOSITORY: repository,
        GITHUB_WORKFLOW_REF: `${repository}/${workflowPath}@refs/pull/${pr}/merge`,
        PR_NUMBER: pr
      }
    })
    const { asked } = JSON.parse(readFileSync(state, 'utf8')) as { asked: string[] }
    return { status: run.status, output: run.stdout, outputs: readFileSync(output, 'utf8'), asked }
  }

  test('is found by a first job that reads the file list, checks nothing out, and runs no script', () => {
    expect(Object.keys(workflow.jobs)).toEqual(['changes', 'review'])
    const { changes } = workflow.jobs
    expect(changes.if).toBe(
      "${{ !github.event.pull_request.draft && github.event.pull_request.user.type != 'Bot' }}"
    )
    expect(changes.permissions).toEqual({ 'pull-requests': 'read' })
    expect(changes.outputs).toEqual({ reviewable: '${{ steps.files.outputs.reviewable }}' })
    expect(changes.steps).toHaveLength(1)
    expect(find.id).toBe('files')
    expect(find.uses).toBeUndefined()
    expect(find.run).not.toMatch(/\bnode\b|review-scripts/)
    expect(find.env).toEqual({
      GH_TOKEN: '${{ github.token }}',
      PR_NUMBER: '${{ github.event.pull_request.number }}'
    })
  })

  test('is skipped by the review job, not failed by it', () => {
    expect(workflow.jobs.review.needs).toBe('changes')
    expect(workflow.jobs.review.if).toBe("needs.changes.outputs.reviewable == 'true'")
  })

  test.runIf(jq).each<[string, Record<string, unknown>[][]]>([
    ['changes it', [page('docs/a.md', workflowPath)]],
    ['changes it on a later page of files', [page('docs/a.md'), page(workflowPath)]],
    [
      'renames it',
      [[{ filename: '.github/workflows/review.yml', previous_filename: workflowPath }]]
    ]
  ])('gets no review and a notice saying a person reviews it, when it %s', (_, pages) => {
    const { status, output, outputs, asked } = findOut(pages)
    expect(status).toBe(0)
    expect(outputs).toBe('reviewable=false\n')
    expect(output).toContain("::notice title=Claude doesn't review this pull request::")
    expect(output).toContain(
      `This pull request changes ${workflowPath}, and Claude's review can't run on a pull request that changes the review workflow`
    )
    expect(output).toContain('A person reviews this pull request')
    expect(asked).toEqual([
      `api repos/${repository}/pulls/${pr}/files --paginate --jq .[] | .filename, (.previous_filename // empty)`
    ])
  })

  test.runIf(jq)(
    'is told apart from one that leaves the workflow alone, or only names it inside another path',
    () => {
      const { status, output, outputs } = findOut([
        page('docs/a.md', '.github/workflows/web.yml'),
        page(`docs/${workflowPath}`, `${workflowPath}.md`)
      ])
      expect(status).toBe(0)
      expect(outputs).toBe('reviewable=true\n')
      expect(output).not.toContain('::notice')
    }
  )

  test.runIf(jq)('asks again when GitHub fails, and fails after three tries', () => {
    const once = findOut([page(workflowPath)], 1)
    expect(once.status).toBe(0)
    expect(once.outputs).toBe('reviewable=false\n')
    expect(once.asked).toHaveLength(2)
    const always = findOut([page('docs/a.md')], 3)
    expect(always.status).not.toBe(0)
    expect(always.output).toContain("::error title=Couldn't read the pull request's files::")
    expect(always.outputs).toBe('')
    expect(always.asked).toHaveLength(3)
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

  test('gives a summary the heading it lacks, which is how the next review finds it', async () => {
    const problem = 'Incomplete: this review did not say how many of the changed files it read.'
    const headless = 'Reviewed abc1234.\n\nNo new findings.'
    const { status, output, requests } = await postSummary(headless, {
      id: '99',
      status: 200,
      problem
    })
    expect(status).toBe(0)
    expect(output).toContain('::warning title=The summary had no heading::')
    expect(JSON.parse(requests[0].body).body).toBe(
      `## Claude review\n\n**${problem}**\n\n${headless}`
    )
  })

  test('refuses a summary too long for a comment, and posts nothing', async () => {
    const { status, output, requests } = await postSummary(
      `${summaryBody.body}\n${'x'.repeat(60_001)}`,
      { id: '99' }
    )
    expect(status).not.toBe(0)
    expect(output).toContain('60000')
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
