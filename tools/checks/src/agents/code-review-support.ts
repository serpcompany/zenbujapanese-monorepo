import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { minutesAfter } from './guards'
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
  closes?: Record<string, unknown>[]
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
  const routes: Record<string, unknown> = {
    '/graphql': {
      data: {
        repository: {
          pullRequest: { closingIssuesReferences: { nodes: pullRequest.closes ?? [] } }
        }
      }
    },
    [`/repos/${repository}/issues/${pr}/comments`]: comments(pullRequest.issueComments),
    [`/repos/${repository}/pulls/${pr}/comments`]: comments(pullRequest.reviewComments),
    [`/repos/${repository}/pulls/${pr}/reviews`]: (pullRequest.reviews ?? []).map(
      ({ login, at }) => ({ user: { login }, submitted_at: at })
    )
  }
  return url => {
    const status = pullRequest.status ?? 200
    if (status !== 200) return { status, body: { message: 'Not allowed' } }
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

export interface Attempt {
  log: unknown
  summary?: string
  changedFiles: number
  change?: unknown
}

export async function decide(step: Step, attempt: Attempt) {
  const first = step === firstVerdict
  const run = await runNodeStep(
    step,
    {
      CHANGED_FILES: String(attempt.changedFiles),
      EXECUTION_FILE: attempt.log === undefined ? '' : 'log.json',
      SUMMARY_FILE: attempt.summary === undefined ? noSuchFile : 'summary.md',
      GITHUB_OUTPUT: 'output.txt',
      GITHUB_STEP_SUMMARY: 'step-summary.md',
      ...(first
        ? {
            CHANGE_FILE: 'change.json',
            CHANGE_INDEX: '/checkout/tmp/review-change/index.md',
            CORRECTION_FILE: 'context.md',
            FIRST_ATTEMPT_LOG: 'first-attempt.json'
          }
        : {})
    },
    () => undefined,
    {
      'output.txt': '',
      'step-summary.md': '',
      'context.md': '# Repository rules for this review\n',
      'first-attempt.json': '',
      'change.json': JSON.stringify(attempt.change ?? []),
      ...(attempt.log === undefined ? {} : { 'log.json': JSON.stringify(attempt.log) }),
      ...(attempt.summary === undefined ? {} : { 'summary.md': attempt.summary })
    }
  )
  return {
    ...run,
    outputs: outputsOf(run.files['output.txt']),
    correction: run.files['context.md'],
    stepSummary: run.files['step-summary.md'],
    keptLog: run.files['first-attempt.json'],
    summaryLeft: run.files['summary.md'],
    logLeft: run.files['log.json']
  }
}

export function postSummary(
  summary: string | undefined,
  { id = '', problem = '', status = 201 } = {}
) {
  return runNodeStep(
    post,
    {
      PR_NUMBER: pr,
      GITHUB_REPOSITORY: repository,
      SUMMARY_ID: id,
      PROBLEM: problem,
      SUMMARY_FILE: summary === undefined ? noSuchFile : 'summary.md'
    },
    (_, method) => (method === 'GET' ? undefined : { status, body: {} }),
    summary === undefined ? {} : { 'summary.md': summary }
  )
}
