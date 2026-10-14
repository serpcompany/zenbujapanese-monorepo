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
  type PullRequest,
  replay,
  reviewRun,
  rulesHeading,
  summaryOf,
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
    const last = await expectPostedWithoutALine(run)
    expect(last.comments[0].body).toBe(kept.summary.trim())
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
    const [{ body }] = last.comments
    expect(headOf(body)).toEqual(labelledWith(thin, 'Reviewed c58455e, round 1.'))
    expect(body.endsWith(pullRequest761.summary.trim().split('\n').slice(1).join('\n'))).toBe(true)
    const checked = await run.check(summaryPostedDuringTheRun(body), 'success')
    expect(checked.output).not.toContain('::error')
    expect(checked.output).toContain('Claude review, second attempt: 10 turns')
    expect(checked.status).toBe(0)
  })
})

describe('a thin first attempt whose second attempt writes a summary', () => {
  const stopped = 'Incomplete: the second attempt at this review stopped before it finished.'
  const partly = 'Read 10 of 19 changed files.\nNot read: the rest.'
  const short = 'Incomplete: this review read 10 of 19 changed files and'

  test('is replaced by one that read the whole change: no line, no warning, and the check passes', async () => {
    const whole = summaryOf('Read 19 of 19 changed files.').body
    const run = replay(pullRequest761, changeOf761)
    expect((await run.first()).outputs.retry).toBe('true')
    run.attempt([...reviewers, result()], whole)
    const last = await expectPostedWithoutALine(run)
    expect(last.comments[0].body).toBe(whole)
    const checked = await run.check(summaryPostedDuringTheRun(whole), 'success')
    expect(checked.output).not.toMatch(/::(error|warning)/)
    expect(checked.output).toContain('Claude review, second attempt: 9 turns')
    expect(checked.status).toBe(0)
  })

  test.each<[string, unknown, string, string[]]>([
    [
      'was stopped at its time limit after reading the whole change',
      undefined,
      'Read 19 of 19 changed files.',
      [stopped]
    ],
    [
      'ended in an error with files left unread',
      [usageLimit],
      partly,
      [stopped, `${short} did not run its reviewers.`]
    ],
    [
      'was stopped at its time limit with files left unread',
      undefined,
      partly,
      [stopped, `${short} left no log of its reviewers.`]
    ]
  ])('is posted saying first that it stopped early, and the job passes with a warning, when the second attempt %s', async (_, secondLog, coverage, lines) => {
    const run = replay(pullRequest761, changeOf761)
    await run.first()
    run.attempt(secondLog, summaryOf(coverage).body)
    const last = await run.last({ RETRY_OUTCOME: 'failure' })
    expect(last.status).toBe(0)
    expect(last.outputs.problem).toBe(lines.join(' '))
    expect(last.output).toContain(
      `::warning title=Claude's review is incomplete::${lines.join(' ')}`
    )
    const [{ body }] = last.comments
    expect(body.split('\n').slice(0, 3 + 2 * lines.length)).toEqual([
      '## Claude review',
      '',
      ...lines.flatMap(line => [`**${line}**`, '']),
      'Reviewed abc1234, round 1.'
    ])
    const checked = await run.check(summaryPostedDuringTheRun(body), 'failure')
    expect(checked.output).not.toContain('::error')
    expect(checked.output).toContain(
      "::warning title=The second attempt at the review didn't finish::"
    )
    expect(checked.status).toBe(0)
  })
})

describe('a pull request closed or merged while the review ran', () => {
  const merged: PullRequest = { state: 'closed', merged: true }
  const stoppedAtOnce = result({ result: 'This pull request is closed, so I posted nothing.' })

  test('gets no second attempt, no summary, and a check that passes with a notice', async () => {
    const run = reviewRun({ changedFiles: 19, change: changeOf761, onGitHub: merged })
    run.attempt([stoppedAtOnce])
    const first = await run.first()
    expect(first.outputs.retry).toBe('false')
    expect(first.output).toContain(
      "This pull request was merged while the review ran, so the review isn't run again"
    )
    expect(run.read('context.md')).toBe(rulesHeading)
    const last = await run.last()
    expect(last.status).toBe(0)
    expect(last.output).not.toContain('::warning')
    expect(last.comments).toEqual([])
    const checked = await run.check(merged, 'skipped')
    expect(checked.output).toContain(
      '::notice title=The pull request was merged while the review ran::'
    )
    expect(checked.output).not.toContain('::error')
    expect(checked.status).toBe(0)
  })

  test('still has what a thin review wrote before then posted, with its line', async () => {
    const run = reviewRun({ changedFiles: 19, change: changeOf761, onGitHub: { state: 'closed' } })
    run.attempt(pullRequest761.log, pullRequest761.summary)
    expect((await run.first()).outputs).toEqual({ retry: 'false', problem: thin })
    const last = await run.last()
    expect(headOf(last.comments[0].body)).toEqual(labelledWith(thin, 'Reviewed c58455e, round 1.'))
  })

  test('still fails the job when nothing was posted on one that is open', async () => {
    const run = reviewRun({ changedFiles: 19, onGitHub: { state: 'open' } })
    run.attempt([stoppedAtOnce])
    expect((await run.first()).outputs.retry).toBe('true')
    run.attempt([stoppedAtOnce])
    expect((await run.last()).output).toContain('::warning title=No summary to post::')
    const checked = await run.check({ state: 'open' }, 'success')
    expect(checked.status).not.toBe(0)
    expect(checked.output).toContain('Claude finished without posting a finding')
  })
})

describe('a thin first attempt whose second attempt leaves no summary', () => {
  const line = `${thin}${noSummaryFromSecond}`
  const thinThenNothing = async (secondLog: unknown) => {
    const run = replay(pullRequest761, changeOf761)
    await run.first()
    run.attempt(secondLog)
    const last = await run.last()
    return { run, last, body: last.comments[0].body }
  }

  test.each<[string, unknown, string]>([
    ['ended in an error', [usageLimit], 'failure'],
    ['failed before Claude ran, or was stopped at its time limit', undefined, 'failure'],
    ['finished without writing one', [...reviewers, result()], 'success']
  ])('is posted with its line, and the job passes, when the second attempt %s', async (_, secondLog, outcome) => {
    const { run, last, body } = await thinThenNothing(secondLog)
    expect(last.status).toBe(0)
    expect(last.outputs).toEqual({ retry: 'false', problem: line })
    expect(last.output).toContain(`::warning title=Claude's review is incomplete::${line}`)
    expect(last.comments).toHaveLength(1)
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
    expect(last.output).toContain('::warning title=No summary to post::')
    expect(last.comments).toEqual([])
    const checked = await run.check({}, 'failure')
    expect(checked.status).not.toBe(0)
    expect(checked.output).toContain(
      "The second attempt at the review didn't finish, and no summary was posted."
    )
    expect(checked.output).toContain("You've hit your usage limit.")
  })
})
