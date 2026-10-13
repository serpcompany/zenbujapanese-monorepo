import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect } from 'vitest'
import type { ReviewCase } from './code-review-cases'
import { minutesAfter } from './guards'
import { scratchFolder } from './scratch'
import {
  claudeStep,
  guardAfter,
  type Route,
  runNodeStep,
  type Step,
  workflowSteps
} from './workflow'

export const workflowPath = '.github/workflows/code-review.yml'
export const steps = workflowSteps(workflowPath, 'review')
export const { step: review, index: reviewIndex } = claudeStep(steps)
export const { step: guard, index: guardIndex } = guardAfter(steps, review)
const stepWithId = (id: string) => steps.find(step => step.id === id) as Step
export const firstVerdict = stepWithId('first')
export const retry = stepWithId('retry')
export const lastVerdict = stepWithId('verdict')
export const post = steps.find(step => step.name === "Post the review's summary") as Step
export const repository = 'serpcompany/zenbujapanese-monorepo'
export const pr = '7'
export const bot = 'claude[bot]'
export const summaryBot = 'github-actions[bot]'
const startedAt = '2026-10-01T10:00:00Z'
export const minutesAfterStart = (minutes: number) => minutesAfter(startedAt, minutes)
export const summaryOf = (coverage: string) => ({
  body: `## Claude review\nReviewed abc1234, round 1.\n${coverage}\n\nNo new findings.`
})
export const summaryBody = summaryOf('Read 4 of 4 changed files.')
export const requestReply = { body: 'Done: I renamed the helper in abc1234.' }
export const rulesHeading = '# Repository rules for this review\n'
export const ruleFiles = ['AGENTS.md', 'ARCHITECTURE.md', 'docs/agents/code.md', 'CONTEXT.md']
const noSuchFile = join(tmpdir(), 'no-such-folder', 'summary.md')

interface Posted {
  login: string
  at: string
  updatedAt?: string
  details?: Record<string, unknown>
}

export interface PullRequest {
  issueComments?: Posted[]
  reviewComments?: Posted[]
  reviews?: Posted[]
  files?: Record<string, unknown>[]
  filesPerPage?: number
  body?: string
  base?: string
  closes?: Record<string, unknown>[]
  issues?: Record<string, unknown>[]
  rules?: Record<string, string>
  unavailableFor?: number
  status?: number
}

export function github(pullRequest: PullRequest): Route {
  const comments = (items: Posted[] = []) =>
    items.map(({ login, at, updatedAt, details }) => ({
      user: { login },
      created_at: at,
      updated_at: updatedAt ?? at,
      ...details
    }))
  const files = `/repos/${repository}/pulls/${pr}/files`
  const contents = `/repos/${repository}/contents/`
  const rules =
    pullRequest.rules ?? Object.fromEntries(ruleFiles.map(file => [file, `${file}'s rules.\n`]))
  const routes: Record<string, unknown> = {
    [`/repos/${repository}/issues/${pr}/comments`]: comments(pullRequest.issueComments),
    [`/repos/${repository}/pulls/${pr}/comments`]: comments(pullRequest.reviewComments),
    [`/repos/${repository}/pulls/${pr}/reviews`]: (pullRequest.reviews ?? []).map(
      ({ login, at }) => ({ user: { login }, submitted_at: at })
    )
  }
  let refusals = pullRequest.unavailableFor ?? 0
  const graphql = (sent: string) => {
    const { query, variables } = JSON.parse(sent) as {
      query: string
      variables: { owner: string; name: string; number: number }
    }
    if (!query.includes('closingIssuesReferences')) {
      const from = `${variables.owner}/${variables.name}`
      const issue = (pullRequest.issues ?? []).find(
        each =>
          each.number === variables.number &&
          (each.repository as { nameWithOwner: string }).nameWithOwner === from
      )
      return { data: { repository: { issue: issue ?? null } } }
    }
    return {
      data: {
        repository: {
          defaultBranchRef: { name: 'main' },
          pullRequest: {
            body: pullRequest.body ?? 'No issue: a change with no issue filed',
            baseRefName: pullRequest.base ?? 'main',
            closingIssuesReferences: { nodes: pullRequest.closes ?? [] }
          }
        }
      }
    }
  }
  return (url, _, sent) => {
    const status = pullRequest.status ?? 200
    if (status !== 200) return { status, body: { message: 'Not allowed' } }
    if (refusals > 0) {
      refusals -= 1
      return { status: 502, body: { message: 'Bad gateway' } }
    }
    if (url.pathname === '/graphql') return { status, body: graphql(sent) }
    if (url.pathname.startsWith(contents)) {
      const text = rules[url.pathname.slice(contents.length)]
      const fromTheBase = url.searchParams.get('ref') === (pullRequest.base ?? 'main')
      return fromTheBase && text !== undefined ? { status, body: null, text } : undefined
    }
    if (url.pathname === files) {
      const size = pullRequest.filesPerPage ?? 100
      const page = Number(url.searchParams.get('page') ?? '1')
      const listed = pullRequest.files ?? []
      const nextPage =
        page * size < listed.length ? `${files}?per_page=100&page=${page + 1}` : undefined
      return { status, body: listed.slice((page - 1) * size, page * size), nextPage }
    }
    const body = routes[url.pathname]
    return body ? { status, body } : undefined
  }
}

export const environment = {
  GITHUB_REPOSITORY: repository,
  PR_NUMBER: pr,
  REVIEW_BOT: bot,
  SUMMARY_BOT: summaryBot,
  REVIEW_STARTED_AT: startedAt
}

export const outputsOf = (written: string) =>
  Object.fromEntries(
    written
      .split('\n')
      .filter(Boolean)
      .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)])
  )

export function postSummary(
  summary: string | undefined,
  { id = '', problem = '', status = 201 } = {},
  file = 'summary.md'
) {
  return runNodeStep(
    post,
    {
      PR_NUMBER: pr,
      GITHUB_REPOSITORY: repository,
      SUMMARY_ID: id,
      PROBLEM: problem,
      SUMMARY_FILE: summary === undefined ? noSuchFile : file
    },
    (_, method) => (method === 'GET' ? undefined : { status, body: {} }),
    summary === undefined || file !== 'summary.md' ? {} : { 'summary.md': summary }
  )
}

export function reviewRun(setup: {
  changedFiles: number
  change?: unknown
  onGitHub?: PullRequest
}) {
  const folder = scratchFolder('review-run')
  const at = (name: string) => join(folder, name)
  const read = (name: string) => (existsSync(at(name)) ? readFileSync(at(name), 'utf8') : undefined)
  const put = (name: string, text: string | undefined) =>
    text === undefined ? rmSync(at(name), { force: true }) : writeFileSync(at(name), text)
  put('context.md', rulesHeading)
  put('change.json', JSON.stringify(setup.change ?? []))
  const shared = {
    ...environment,
    CHANGED_FILES: String(setup.changedFiles),
    EXECUTION_FILE: at('log.json'),
    FIRST_ATTEMPT_LOG: at('first-attempt.json'),
    FIRST_ATTEMPT_SUMMARY: at('first-attempt-summary.md'),
    GITHUB_STEP_SUMMARY: at('step-summary.md'),
    SUMMARY_FILE: at('summary.md')
  }
  const decide = async (step: Step, more: Record<string, string> = {}) => {
    put('output.txt', '')
    const run = await runNodeStep(
      step,
      { ...shared, GITHUB_OUTPUT: at('output.txt'), ...more },
      github(setup.onGitHub ?? {})
    )
    return { ...run, outputs: outputsOf(read('output.txt') ?? '') }
  }
  return {
    read,
    attempt(log: unknown, summary?: string) {
      put('log.json', log === undefined ? undefined : JSON.stringify(log))
      put('summary.md', summary)
    },
    first: () =>
      decide(firstVerdict, {
        CHANGE_FILE: at('change.json'),
        CHANGE_INDEX: '/checkout/tmp/review-change/index.md',
        CORRECTION_FILE: at('context.md')
      }),
    last: () => decide(lastVerdict),
    post: (problem: string) =>
      postSummary(read('summary.md'), { id: '99', problem, status: 200 }, at('summary.md')),
    check: (posted: PullRequest, retryOutcome: string) =>
      runNodeStep(
        guard,
        { ...shared, CLAUDE_OUTCOME: 'success', RETRY_OUTCOME: retryOutcome },
        github(posted)
      )
  }
}

export function replay(kept: ReviewCase, change: unknown = []) {
  const run = reviewRun({ changedFiles: kept.changedFiles, change })
  run.attempt(kept.log, kept.summary)
  return run
}

export const summaryPostedDuringTheRun = (body: string): PullRequest => ({
  issueComments: [{ login: summaryBot, at: minutesAfterStart(6), details: { body } }]
})

export const headOf = (body: string) => body.split('\n').slice(0, 5)

export const labelledWith = (line: string, next: string) => [
  '## Claude review',
  '',
  `**${line}**`,
  '',
  next
]

export async function expectPostedWithoutALine(run: ReturnType<typeof reviewRun>) {
  const last = await run.last()
  expect(last.outputs).toEqual({ retry: 'false', problem: '' })
  expect(last.output).not.toContain('::warning')
  return run.post(last.outputs.problem)
}
