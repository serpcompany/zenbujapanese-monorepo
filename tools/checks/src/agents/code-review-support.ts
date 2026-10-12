import { minutesAfter } from './guards'
import { claudeStep, guardAfter, type Route, workflowSteps } from './workflow'

export const steps = workflowSteps('.github/workflows/code-review.yml', 'review')
export const { step: review, index: reviewIndex } = claudeStep(steps)
export const { step: guard, index: guardIndex } = guardAfter(steps, review)
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
  changedFiles?: number
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
  const routes: Record<string, unknown> = {
    [`/repos/${repository}/pulls/${pr}`]: { changed_files: pullRequest.changedFiles ?? 4 },
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

export const environment = {
  GITHUB_REPOSITORY: repository,
  PR_NUMBER: pr,
  REVIEW_BOT: bot,
  SUMMARY_BOT: summaryBot,
  REVIEW_STARTED_AT: startedAt
}
