import { describe, expect, test } from 'vitest'
import {
  guardIndex,
  lastVerdict,
  type PullRequest,
  pr,
  repository,
  review,
  reviewIndex,
  reviewRun,
  steps,
  summaryBody,
  summaryOf,
  workflowPath
} from './code-review-support'
import { claudeResult } from './guards'
import { readWorkflow } from './workflow'

const result = claudeResult({ num_turns: 9, duration_ms: 30_000, total_cost_usd: 0.3 })
const written = `${summaryBody.body}\n`
const post = (summary: string | undefined, summaryId = '', onGitHub: PullRequest = {}) => {
  const run = reviewRun({ changedFiles: 4, summaryId, onGitHub })
  run.attempt([result()], summary)
  return run.last()
}

describe("the review's summary", () => {
  test('is posted by the step that measures the last attempt, before the last step, with the job token', () => {
    expect(lastVerdict.name).toBe(
      'Say whether the last attempt read the whole change, and post its summary'
    )
    expect(steps.indexOf(lastVerdict)).toBeGreaterThan(reviewIndex)
    expect(steps.indexOf(lastVerdict)).toBeLessThan(guardIndex)
    expect(lastVerdict.if).toContain(`steps.${review.id}.outcome == 'success'`)
    expect(lastVerdict.env).toMatchObject({
      GITHUB_TOKEN: '${{ github.token }}',
      SUMMARY_ID: '${{ steps.earlier.outputs.summary_id }}',
      SUMMARY_FILE: 'tmp/review-summary.md'
    })
    expect(readWorkflow(workflowPath).jobs.review.permissions).toMatchObject({
      contents: 'read',
      'pull-requests': 'write'
    })
    const startIndex = steps.findIndex(step => step.run?.includes('REVIEW_STARTED_AT='))
    expect(steps[startIndex].run).toContain('rm -f tmp/review-summary.md')
  })

  test('updates the earlier summary comment in place', async () => {
    const { status, comments } = await post(written, '99')
    expect(status).toBe(0)
    expect(comments).toEqual([
      { sent: `PATCH /repos/${repository}/issues/comments/99`, body: summaryBody.body }
    ])
  })

  test('posts a new summary comment when there is none', async () => {
    const { status, comments } = await post(written)
    expect(status).toBe(0)
    expect(comments.map(({ sent }) => sent)).toEqual([
      `POST /repos/${repository}/issues/${pr}/comments`
    ])
  })

  test('says first, under its heading, when the review was incomplete, even where the heading was missing', async () => {
    const problem = 'Incomplete: this review did not say how many of the changed files it read.'
    const headless = 'Reviewed abc1234.\n\nNo new findings.'
    const { status, output, comments } = await post(headless, '99')
    expect(status).toBe(0)
    expect(output).toContain('::warning title=The summary had no heading::')
    expect(comments[0].body).toBe(`## Claude review\n\n**${problem}**\n\n${headless}`)
  })

  test('refuses a summary too long for a comment, and posts nothing', async () => {
    const { status, output, comments } = await post(`${summaryBody.body}\n${'x'.repeat(60_001)}`)
    expect(status).not.toBe(0)
    expect(output).toContain("::error title=Couldn't post the review's summary::")
    expect(output).toContain('60000')
    expect(comments).toEqual([])
  })

  test('fails when GitHub refuses the comment', async () => {
    const { status, output } = await post(written, '99', { commentStatus: 403 })
    expect(status).not.toBe(0)
    expect(output).toContain(
      "::error title=Couldn't post the review's summary::PATCH /issues/comments/99 returned 403"
    )
  })

  test('sends an update again when GitHub is unavailable, and takes its status as the answer', async () => {
    const updated = await post(written, '99', { unavailableFor: 1 })
    expect(updated.status).toBe(0)
    expect(updated.comments).toHaveLength(2)
    const answeredInPart = await post(written, '99', { lostBodies: 1 })
    expect(answeredInPart.status).toBe(0)
    expect(answeredInPart.comments).toHaveLength(1)
  })

  test.each<[string, PullRequest, string]>([
    ['a server error', { unavailableFor: 1, unavailable: { status: 502 } }, 'returned 502'],
    ['a server error that names a wait', { unavailableFor: 1 }, 'returned 502'],
    ['no answer', { lostAnswers: 1 }, 'got no whole answer']
  ])('is never created again after %s, when it may already be there', async (_, onGitHub, outcome) => {
    const created = await post(written, '', onGitHub)
    expect(created.status).not.toBe(0)
    expect(created.output).toContain(`POST /issues/${pr}/comments ${outcome}`)
    expect(created.comments).toHaveLength(1)
  })

  test.each([
    ['a 429', { status: 429, headers: { 'retry-after': '1' } }],
    ['a 403 that names a wait', { status: 403, headers: { 'retry-after': '1' } }]
  ])('is created again after %s, which GitHub refused without acting', async (_, unavailable) => {
    const created = await post(written, '', { unavailableFor: 1, unavailable })
    expect(created.status).toBe(0)
    expect(created.comments).toHaveLength(2)
  })

  test('warns and posts nothing when Claude wrote no summary', async () => {
    const { status, output, comments } = await post(undefined, '99')
    expect(status).toBe(0)
    expect(output).toContain('::warning title=No summary to post::')
    expect(comments).toEqual([])
  })

  test('is posted as written when it accounts for the whole change', async () => {
    const complete = summaryOf('Read 3 of 4 changed files.\nNot read: a.png (not text).').body
    const run = reviewRun({ changedFiles: 4 })
    run.attempt(
      [
        ...['bugs', 'rules', 'issue'].map(id => ({
          type: 'assistant',
          message: { content: [{ type: 'tool_use', id, name: 'Agent', input: {} }] }
        })),
        result()
      ],
      complete
    )
    const { comments, output } = await run.last()
    expect(comments[0].body).toBe(complete)
    expect(output).toContain('Complete: the summary accounts for all 4 changed files.')
  })
})
