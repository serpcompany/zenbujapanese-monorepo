import { describe, expect, test } from 'vitest'
import {
  answered,
  called,
  changeFolder,
  changeOf761,
  findingOf757,
  inlineComment,
  pullRequest757,
  pullRequest759,
  pullRequest761,
  type ReviewCase,
  runnerWorkspace
} from './code-review-cases'
import {
  bot,
  decide,
  environment,
  firstVerdict,
  github,
  guard,
  lastVerdict,
  minutesAfterStart,
  postSummary,
  retry,
  review,
  reviewIndex,
  steps,
  summaryBot,
  summaryOf
} from './code-review-support'
import { claudeResult, executionLog } from './guards'
import { runNodeStep } from './workflow'

const result = claudeResult({ num_turns: 9, duration_ms: 30_000, total_cost_usd: 0.3 })
const reviewer = (id: string, name = 'Agent') => called(id, name, { description: id })
const threeReviewers = [reviewer('bugs'), reviewer('rules'), reviewer('issue', 'Task')]
const summary = (coverage: string) => summaryOf(coverage).body
const incomplete = (reason: string) => `Incomplete: this review ${reason}.`
const cases: [string, unknown[], string | undefined, number, string][] = [
  ['every file read by three reviewers', threeReviewers, 'Read 4 of 4 changed files.', 4, ''],
  ['every file read without reviewers', [], 'Read 4 of 4 changed files.', 4, ''],
  [
    'files left unread, named, with three reviewers',
    threeReviewers,
    'Read 4 of 6 changed files.\nNot read: pnpm-lock.yaml and a.png (not text).',
    6,
    ''
  ],
  [
    'files left unread, named, without reviewers',
    [],
    'Read 2 of 61 changed files.\nNot read: the other 59.',
    61,
    'read 2 of 61 changed files and did not run its reviewers'
  ],
  [
    'files left unread, named, with two reviewers',
    threeReviewers.slice(0, 2),
    'Read 2 of 61 changed files.\nNot read: the other 59.',
    61,
    'read 2 of 61 changed files and ran 2 of its three reviewers'
  ],
  [
    'files left unread and unnamed, with three reviewers',
    threeReviewers,
    'Read 2 of 61 changed files.',
    61,
    'read 2 of 61 changed files and did not name the rest'
  ],
  [
    'files left unread and unnamed, without reviewers',
    [],
    'Read 2 of 61 changed files.',
    61,
    'read 2 of 61 changed files, did not name the rest and did not run its reviewers'
  ],
  ['no summary', threeReviewers, undefined, 4, 'wrote no summary'],
  [
    'a summary that does not say what it read',
    threeReviewers,
    'No coverage here.',
    4,
    'did not say how many of the changed files it read'
  ],
  [
    "a file count that is not the pull request's",
    threeReviewers,
    'Read 2 of 2 changed files.',
    61,
    'counted 2 changed files where the pull request has 61'
  ],
  [
    'more files read than changed',
    threeReviewers,
    'Read 5 of 4 changed files.',
    4,
    'said it read 5 of 4 changed files'
  ]
]
const replay = ({ log, summary: written, changedFiles }: ReviewCase, change: unknown = []) => ({
  log,
  summary: written,
  changedFiles,
  change
})

describe('whether a review read the whole change', () => {
  test('is decided once, after each attempt, from its log, its summary, and the file count', () => {
    expect(steps.indexOf(firstVerdict)).toBe(reviewIndex + 1)
    expect(steps.indexOf(retry)).toBe(reviewIndex + 2)
    expect(steps.indexOf(lastVerdict)).toBe(reviewIndex + 3)
    expect(lastVerdict.run).toBe(firstVerdict.run)
    expect(firstVerdict.shell).toBe('node {0}')
    expect(firstVerdict.env).toMatchObject({
      CHANGED_FILES: '${{ steps.earlier.outputs.changed_files }}',
      CHANGE_FILE: '${{ runner.temp }}/review-change.json',
      CORRECTION_FILE: '${{ runner.temp }}/review-context.md',
      EXECUTION_FILE: `\${{ steps.${review.id}.outputs.execution_file }}`,
      SUMMARY_FILE: 'tmp/review-summary.md'
    })
    expect(lastVerdict.env).toEqual({
      CHANGED_FILES: '${{ steps.earlier.outputs.changed_files }}',
      EXECUTION_FILE: `\${{ steps.${retry.id}.outputs.execution_file || steps.${review.id}.outputs.execution_file }}`,
      SUMMARY_FILE: 'tmp/review-summary.md'
    })
  })

  test.each(cases)('%s', async (_, calls, coverage, changedFiles, reason) => {
    const attempt = {
      log: [...calls, result()],
      summary: coverage === undefined ? undefined : summary(coverage),
      changedFiles
    }
    const [first, last] = await Promise.all([
      decide(firstVerdict, attempt),
      decide(lastVerdict, attempt)
    ])
    expect(first.status).toBe(0)
    expect(last.status).toBe(0)
    expect(first.outputs).toEqual({
      complete: String(reason === ''),
      retry: String(reason !== ''),
      problem: reason ? incomplete(reason) : ''
    })
    expect(last.outputs).toEqual({ ...first.outputs, retry: 'false' })
  })

  test('counts a summary whose line is a list item or in bold', async () => {
    for (const coverage of ['- Read 4 of 4 changed files.', '**Read 1 of 1 changed file.**']) {
      const changedFiles = Number(/of (\d+)/.exec(coverage)?.[1])
      const { outputs } = await decide(firstVerdict, {
        log: [result()],
        summary: summary(coverage),
        changedFiles
      })
      expect(outputs.complete).toBe('true')
    }
  })

  test('has nothing to measure, and asks for no second attempt, when no review finished', async () => {
    for (const log of [undefined, [{ type: 'system', subtype: 'init' }]]) {
      const { status, outputs } = await decide(firstVerdict, { log, changedFiles: 4 })
      expect(status).toBe(0)
      expect(outputs).toEqual({ complete: 'false', retry: 'false', problem: '' })
    }
  })

  test("fails when it isn't told how many files the pull request changes", async () => {
    const run = await runNodeStep(
      firstVerdict,
      { ...executionLog([result()]).env, CHANGED_FILES: '', SUMMARY_FILE: 'summary.md' },
      () => undefined,
      { ...executionLog([result()]).files, 'summary.md': summary('Read 4 of 4 changed files.') }
    )
    expect(run.status).not.toBe(0)
    expect(run.output).toContain('CHANGED_FILES')
  })
})

describe('a second attempt at the review', () => {
  test("runs the same review once more, only when the first didn't read the whole change", () => {
    expect(retry.if).toBe("steps.first.outputs.retry == 'true'")
    expect(retry.uses).toBe(review.uses)
    expect(retry.env).toEqual(review.env)
    expect(retry.with).toEqual(review.with)
    expect(steps.filter(step => step.uses === review.uses)).toHaveLength(2)
  })

  test("is asked for by #761's first attempt, and told what that attempt left out", async () => {
    const first = await decide(firstVerdict, replay(pullRequest761, changeOf761))
    const reason = 'read 2 of 19 changed files and did not run its reviewers'
    expect(first.outputs).toEqual({ complete: 'false', retry: 'true', problem: incomplete(reason) })
    expect(first.output).not.toContain('::warning')
    expect(first.correction).toContain('# Repository rules for this review\n')
    expect(first.correction).toContain('# This is the second attempt at this review')
    expect(first.correction).toContain(`The first attempt, on this same commit, ${reason}.`)
    expect(first.correction).toContain(
      'the first attempt opened 2 of the 19 changed files listed in /checkout/tmp/review-change/index.md. It never opened these 17, so read each one now:'
    )
    const listed = first.correction.split('\n').filter(line => line.startsWith('- '))
    expect(listed).toHaveLength(17)
    expect(listed[0]).toBe(`- AGENTS.md: ${changeFolder}/0001.patch`)
    expect(listed.at(-1)).toBe(
      `- tools/checks/src/deployer/stand-ins.ts: ${changeFolder}/0019.patch`
    )
    expect(first.correction).not.toContain('- deploy/deployer.sh:')
    expect(first.correction).not.toContain('- docs/agents/deployer-alerts.md:')
    expect(first.correction).toContain('The first attempt posted no inline comments.')
  })

  test('starts from nothing the first attempt left: its summary is gone and its log is kept', async () => {
    const first = await decide(firstVerdict, replay(pullRequest761, changeOf761))
    expect(first.summaryLeft).toBeUndefined()
    expect(first.logLeft).toBeUndefined()
    expect(JSON.parse(first.keptLog)).toEqual(JSON.parse(JSON.stringify(pullRequest761.log)))
    const transcript = steps.find(step => step.name === 'Keep the review transcript')
    expect(transcript?.with?.path).toContain(firstVerdict.env?.FIRST_ATTEMPT_LOG)
    expect(transcript?.with?.path).toContain(`steps.${review.id}.outputs.execution_file }}`)
  })

  test('counts a file as opened by its patch or by itself, whoever read it', async () => {
    const change = changeOf761.slice(0, 3)
    const first = await decide(firstVerdict, {
      log: [
        called('patch', 'Read', { file_path: change[0].patch, offset: 1, limit: 400 }),
        answered('patch'),
        { ...called('itself', 'Read', { file_path: change[1].file }), parent_tool_use_id: 'bugs' },
        answered('itself'),
        called('refused', 'Read', { file_path: change[2].patch }),
        answered('refused', true),
        result()
      ],
      summary: summary('Read 2 of 3 changed files.'),
      changedFiles: 3,
      change
    })
    expect(first.correction).toContain('opened 2 of the 3 changed files')
    expect(first.correction.split('\n').filter(line => line.startsWith('- '))).toEqual([
      `- deploy/deployer.sh: ${changeFolder}/0003.patch`
    ])
  })

  test('points at the file itself where GitHub gave no patch, and lists nothing that cannot be read', async () => {
    const first = await decide(firstVerdict, {
      log: [result()],
      changedFiles: 2,
      change: [
        { path: 'assets/logo.png', patch: null, file: `${runnerWorkspace}/assets/logo.png` },
        { path: 'assets/old.png', patch: null, file: null }
      ]
    })
    expect(first.correction).toContain('The first attempt, on this same commit, wrote no summary.')
    expect(first.correction.split('\n').filter(line => line.startsWith('- '))).toEqual([
      `- assets/logo.png: ${runnerWorkspace}/assets/logo.png`
    ])
  })

  test('is told which inline comments the first attempt posted, so it posts none twice', async () => {
    const unposted = { ...findingOf757, path: 'apps/web/worker.ts', line: 3 }
    const first = await decide(firstVerdict, {
      log: [
        ...pullRequest757.log.slice(0, -1),
        called('failed', inlineComment, { ...unposted, body: 'The line is not in the diff.' }),
        answered('failed', true),
        called('buffered', inlineComment, { ...unposted, confirmed: false, body: 'Never posted.' }),
        answered('buffered'),
        result()
      ],
      summary: summary('Read 2 of 9 changed files.\nNot read: the rest.'),
      changedFiles: 9
    })
    expect(first.outputs.retry).toBe('true')
    expect(first.correction).toContain(
      'The first attempt already posted these inline comments. They are earlier findings: post none of them again.'
    )
    expect(first.correction).toContain(
      "- apps/ios/docs/product/translate.md:157: **suggestion** The user-visible change isn't described in the product doc The PR body names"
    )
    expect(first.correction).not.toContain('The line is not in the diff.')
    expect(first.correction).not.toContain('Never posted.')
  })
})

describe("tonight's reviews, replayed", () => {
  test.each([
    ['#757, which read 9 of 9 files without reviewers', pullRequest757],
    ['#759, which read 41 of 71 files, named the rest, and started three reviewers', pullRequest759]
  ])('%s, is complete: no second attempt, and its summary is posted as written', async (_, run) => {
    const first = await decide(firstVerdict, replay(run))
    expect(first.outputs).toEqual({ complete: 'true', retry: 'false', problem: '' })
    expect(first.correction).toBe('# Repository rules for this review\n')
    expect(first.summaryLeft).toBe(run.summary)
    const last = await decide(lastVerdict, replay(run))
    expect(last.outputs).toEqual(first.outputs)
    expect(last.output).not.toContain('::warning')
    const posted = await postSummary(run.summary, { problem: last.outputs.problem })
    expect(JSON.parse(posted.requests[0].body)).toEqual({ body: run.summary.trim() })
  })

  test('#761, still incomplete after its second attempt, is labelled on its comment and in a warning, and the job passes', async () => {
    const last = await decide(lastVerdict, replay(pullRequest761))
    const line = 'Incomplete: this review read 2 of 19 changed files and did not run its reviewers.'
    expect(last.status).toBe(0)
    expect(last.outputs).toEqual({ complete: 'false', retry: 'false', problem: line })
    expect(last.output).toContain(`::warning title=Claude's review is incomplete::${line}`)
    expect(last.stepSummary).toBe(`${line}\n`)
    expect(last.summaryLeft).toBe(pullRequest761.summary)
    const posted = await postSummary(pullRequest761.summary, { problem: last.outputs.problem })
    expect(posted.status).toBe(0)
    const { body } = JSON.parse(posted.requests[0].body) as { body: string }
    expect(body.split('\n').slice(0, 5)).toEqual([
      '## Claude review',
      '',
      `**${line}**`,
      '',
      'Reviewed c58455e, round 1.'
    ])
    expect(body.endsWith(pullRequest761.summary.trim().split('\n').slice(1).join('\n'))).toBe(true)
    const { env, files } = executionLog(pullRequest761.log)
    const checked = await runNodeStep(
      guard,
      { ...environment, ...env },
      github({
        issueComments: [{ login: summaryBot, at: minutesAfterStart(2), details: { body } }],
        reviewComments: [{ login: bot, at: minutesAfterStart(1) }]
      }),
      files
    )
    expect(checked.output).not.toContain('::error')
    expect(checked.status).toBe(0)
  })
})
