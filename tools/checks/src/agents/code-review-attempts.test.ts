import { describe, expect, test } from 'vitest'
import {
  answered,
  called,
  changeOf761,
  pullRequest757,
  pullRequest759,
  pullRequest761
} from './code-review-cases'
import {
  expectPostedWithoutALine,
  headOf,
  labelledWith,
  replay,
  reviewRun,
  rulesHeading,
  summaryPostedDuringTheRun
} from './code-review-support'
import { claudeResult } from './guards'

const result = claudeResult({ num_turns: 9, duration_ms: 30_000, total_cost_usd: 0.3 })
const reviewers = ['bugs', 'rules', 'issue'].flatMap(id => [called(id, 'Agent'), answered(id)])
const thin = 'Incomplete: this review read 2 of 19 changed files and did not run its reviewers.'
const noSummaryFromSecond = " A second attempt left no summary, so this is the first attempt's."
const usageLimit = result({
  is_error: true,
  subtype: 'error_during_execution',
  result: "You've hit your usage limit."
})

describe("tonight's reviews, from abridged copies of their logs", () => {
  test.each([
    ['#757, which read 9 of 9 files without reviewers', pullRequest757],
    ['#759, which read 41 of 71 files, named the rest, and started three reviewers', pullRequest759]
  ])('%s, is complete: no second attempt, and its summary is posted as written', async (_, kept) => {
    const run = replay(kept)
    expect((await run.first()).outputs).toEqual({ retry: 'false', problem: '' })
    expect(run.read('context.md')).toBe(rulesHeading)
    expect(run.read('summary.md')).toBe(kept.summary)
    const posted = await expectPostedWithoutALine(run)
    expect(JSON.parse(posted.requests[0].body)).toEqual({ body: kept.summary.trim() })
  })

  test('#761, still incomplete after its second attempt, is labelled on its comment and in a warning, and the job passes', async () => {
    const run = replay(pullRequest761, changeOf761)
    expect((await run.first()).outputs.retry).toBe('true')
    run.attempt(pullRequest761.log, pullRequest761.summary)
    const last = await run.last()
    expect(last.status).toBe(0)
    expect(last.outputs).toEqual({ retry: 'false', problem: thin })
    expect(last.output).toContain(`::warning title=Claude's review is incomplete::${thin}`)
    expect(run.read('step-summary.md')).toBe(`${thin}\n`)
    const posted = await run.post(last.outputs.problem)
    expect(posted.status).toBe(0)
    const { body } = JSON.parse(posted.requests[0].body) as { body: string }
    expect(headOf(body)).toEqual(labelledWith(thin, 'Reviewed c58455e, round 1.'))
    expect(body.endsWith(pullRequest761.summary.trim().split('\n').slice(1).join('\n'))).toBe(true)
    const checked = await run.check(summaryPostedDuringTheRun(body), 'success')
    expect(checked.output).not.toContain('::error')
    expect(checked.output).toContain('Claude review, second attempt: 10 turns')
    expect(checked.status).toBe(0)
  })
})

describe('a thin first attempt whose second attempt leaves no summary', () => {
  const line = `${thin}${noSummaryFromSecond}`
  const thinThenNothing = async (secondLog: unknown) => {
    const run = replay(pullRequest761, changeOf761)
    await run.first()
    run.attempt(secondLog)
    const last = await run.last()
    const posted = await run.post(last.outputs.problem)
    return { run, last, posted, body: JSON.parse(posted.requests[0].body).body as string }
  }

  test.each<[string, unknown, string]>([
    ['ended in an error', [usageLimit], 'failure'],
    ['failed before Claude ran', undefined, 'failure'],
    ['finished without writing one', [...reviewers, result()], 'success']
  ])('is posted with its line, and the job passes, when the second attempt %s', async (_, secondLog, outcome) => {
    const { run, last, posted, body } = await thinThenNothing(secondLog)
    expect(last.status).toBe(0)
    expect(last.outputs).toEqual({ retry: 'false', problem: line })
    expect(last.output).toContain(`::warning title=Claude's review is incomplete::${line}`)
    expect(posted.status).toBe(0)
    expect(headOf(body)).toEqual(labelledWith(line, 'Reviewed c58455e, round 1.'))
    const checked = await run.check(summaryPostedDuringTheRun(body), outcome)
    expect(checked.output).not.toContain('::error')
    expect(checked.status).toBe(0)
  })

  test("names the second attempt's failure in a warning, since a review was posted", async () => {
    const { run, body } = await thinThenNothing([usageLimit])
    const checked = await run.check(summaryPostedDuringTheRun(body), 'failure')
    expect(checked.output).toContain(
      "::warning title=The second attempt at the review didn't finish::"
    )
    expect(checked.output).toContain("The review ended in an error: You've hit your usage limit.")
    expect(checked.output).toContain('A summary was posted all the same, so the check passes.')
  })

  test('still fails the job when no attempt left anything to post', async () => {
    const run = reviewRun({ changedFiles: 19, change: changeOf761 })
    run.attempt(pullRequest761.log)
    expect((await run.first()).outputs).toEqual({
      retry: 'true',
      problem: 'Incomplete: this review wrote no summary.'
    })
    run.attempt([usageLimit])
    const last = await run.last()
    expect(last.outputs.problem).toBe('Incomplete: this review wrote no summary.')
    const posted = await run.post(last.outputs.problem)
    expect(posted.requests).toEqual([])
    const checked = await run.check({}, 'failure')
    expect(checked.status).not.toBe(0)
    expect(checked.output).toContain(
      "The second attempt at the review didn't finish, and no summary was posted."
    )
    expect(checked.output).toContain("You've hit your usage limit.")
  })
})
