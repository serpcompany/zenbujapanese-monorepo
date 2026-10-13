import { describe, expect, test } from 'vitest'
import {
  answered,
  called,
  changeFolder,
  changeOf761,
  pullRequest761,
  runnerWorkspace
} from './code-review-cases'
import {
  bot,
  expectPostedWithoutALine,
  firstVerdict,
  lastVerdict,
  minutesAfterStart,
  pr,
  replay,
  repository,
  retry,
  review,
  reviewIndex,
  reviewRun,
  rulesHeading,
  steps,
  summaryOf
} from './code-review-support'
import { claudeResult } from './guards'

const result = claudeResult({ num_turns: 9, duration_ms: 30_000, total_cost_usd: 0.3 })
const reviewer = (id: string, name = 'Agent') => [
  called(id, name, { description: id }),
  answered(id)
]
const threeReviewers = [reviewer('bugs'), reviewer('rules'), reviewer('issue', 'Task')].flat()
const summary = (coverage: string) => summaryOf(coverage).body
const incomplete = (reason: string) => `Incomplete: this review ${reason}.`
const listed = (correction: string | undefined) =>
  (correction ?? '').split('\n').filter(line => line.startsWith('- '))
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
    threeReviewers.slice(0, 4),
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
describe('whether a review read the whole change', () => {
  test('is decided by one script, after each attempt, from its log, its summary, and the file count', () => {
    expect(steps.indexOf(firstVerdict)).toBe(reviewIndex + 1)
    expect(steps.indexOf(retry)).toBe(reviewIndex + 2)
    expect(steps.indexOf(lastVerdict)).toBe(reviewIndex + 3)
    expect(lastVerdict.run).toBe(firstVerdict.run)
    expect(firstVerdict.shell).toBe('node {0}')
    const afterAReviewThatRan = `env.HAS_REVIEW_TOKEN == 'true' && steps.${review.id}.outcome == 'success'`
    expect(firstVerdict.if).toBe(afterAReviewThatRan)
    expect(lastVerdict.if).toBe(afterAReviewThatRan)
    const keptFromTheFirstAttempt = {
      FIRST_ATTEMPT_LOG: '${{ runner.temp }}/claude-review-first-attempt.json',
      FIRST_ATTEMPT_SUMMARY: '${{ runner.temp }}/claude-review-first-attempt-summary.md'
    }
    const forGitHub = { GITHUB_TOKEN: '${{ github.token }}' }
    expect(firstVerdict.env).toEqual({
      ...keptFromTheFirstAttempt,
      ...forGitHub,
      STEP: 'first',
      CHANGED_FILES: '${{ steps.earlier.outputs.changed_files }}',
      CHANGE_FILE: '${{ runner.temp }}/review-change.json',
      CHANGE_INDEX: '${{ github.workspace }}/tmp/review-change/index.md',
      CORRECTION_FILE: '${{ runner.temp }}/review-context.md',
      REVIEWERS_CONTEXT_FILE: '${{ runner.temp }}/review-reviewers-context.md',
      EXECUTION_FILE: `\${{ steps.${review.id}.outputs.execution_file }}`,
      SUMMARY_FILE: 'tmp/review-summary.md'
    })
    expect(lastVerdict.env).toEqual({
      ...keptFromTheFirstAttempt,
      ...forGitHub,
      STEP: 'last',
      RETRY_OUTCOME: `\${{ steps.${retry.id}.outcome }}`,
      CHANGED_FILES: '${{ steps.earlier.outputs.changed_files }}',
      EXECUTION_FILE: `\${{ steps.${retry.id}.outputs.execution_file || steps.${review.id}.outputs.execution_file }}`,
      SUMMARY_FILE: 'tmp/review-summary.md',
      SUMMARY_ID: '${{ steps.earlier.outputs.summary_id }}'
    })
  })

  test.each(cases)('%s', async (_, calls, coverage, changedFiles, reason) => {
    const written = coverage === undefined ? undefined : summary(coverage)
    const log = [...calls, result()]
    const once = reviewRun({ changedFiles })
    once.attempt(log, written)
    const first = await once.first()
    expect(first.status).toBe(0)
    expect(first.output).not.toContain('::warning')
    expect(first.outputs).toEqual({
      retry: String(reason !== ''),
      problem: reason ? incomplete(reason) : ''
    })
    const again = reviewRun({ changedFiles })
    again.attempt(log, written)
    const last = await again.last()
    expect(last.status).toBe(0)
    expect(last.outputs).toEqual({ retry: 'false', problem: first.outputs.problem })
    expect(last.output.includes("::warning title=Claude's review is incomplete::")).toBe(
      reason !== ''
    )
    expect(last.output.match(/^Complete: /gm) ?? []).toHaveLength(reason === '' ? 1 : 0)
    expect(first.output).not.toContain('Complete: ')
  })

  test('counts a summary whose line is a list item or in bold', async () => {
    for (const coverage of ['- Read 4 of 4 changed files.', '**Read 1 of 1 changed file.**']) {
      const run = reviewRun({ changedFiles: Number(/of (\d+)/.exec(coverage)?.[1]) })
      run.attempt([result()], summary(coverage))
      expect((await run.first()).outputs).toEqual({ retry: 'false', problem: '' })
    }
  })

  test('counts as reviewers only what the reviewer itself started, and what started', async () => {
    const byAReviewer = { ...called('nested', 'Agent'), parent_tool_use_id: 'bugs' }
    const refused = [called('refused', 'Agent'), answered('refused', true)]
    const run = reviewRun({ changedFiles: 6 })
    run.attempt(
      [...threeReviewers.slice(0, 4), byAReviewer, answered('nested'), ...refused, result()],
      summary('Read 4 of 6 changed files.\nNot read: two images.')
    )
    expect((await run.last()).outputs.problem).toBe(
      incomplete('read 4 of 6 changed files and ran 2 of its three reviewers')
    )
  })

  test('has nothing to measure, and asks for no second attempt, when no review finished', async () => {
    for (const log of [undefined, [{ type: 'system', subtype: 'init' }]]) {
      const run = reviewRun({ changedFiles: 4 })
      run.attempt(log)
      const { status, outputs } = await run.first()
      expect(status).toBe(0)
      expect(outputs).toEqual({ retry: 'false', problem: '' })
    }
  })

  test("fails when it isn't told how many files the pull request changes", async () => {
    const run = reviewRun({ changedFiles: Number.NaN })
    run.attempt([result()], summary('Read 4 of 4 changed files.'))
    const { status, output } = await run.first()
    expect(status).not.toBe(0)
    expect(output).toContain('CHANGED_FILES')
  })
})

describe('a second attempt at the review', () => {
  test("runs the same review once more, and its failure alone doesn't fail the job", () => {
    expect(retry.if).toBe("steps.first.outputs.retry == 'true'")
    expect(retry['continue-on-error']).toBe(true)
    expect(review['continue-on-error']).toBeUndefined()
    expect(retry.uses).toBe(review.uses)
    expect(retry.env).toEqual(review.env)
    expect(retry.with).toEqual(review.with)
    expect(steps.filter(step => step.uses === review.uses)).toHaveLength(2)
  })

  test("posts each inline comment as it is made, so the second attempt can't replay the first's", () => {
    expect(review.with?.classify_inline_comments).toBe('false')
    for (const step of steps) expect(step.run ?? '').not.toContain('inline-comments-buffer')
  })

  test("is asked for by #761's first attempt, and told what that attempt left out", async () => {
    const run = replay(pullRequest761, changeOf761)
    const first = await run.first()
    const reason = 'read 2 of 19 changed files and did not run its reviewers'
    expect(first.outputs).toEqual({ retry: 'true', problem: incomplete(reason) })
    expect(first.output).not.toContain('::warning')
    const correction = run.read('context.md') ?? ''
    expect(
      correction.startsWith(`${rulesHeading}\n# This is the second attempt at this review\n`)
    ).toBe(true)
    expect(correction).toContain(
      `This section is for the reviewer that runs the pr-review skill, not for the reviewers it starts. The first attempt, on this same commit, ${reason}. This attempt is the last.`
    )
    expect(correction).toContain(
      'the first attempt opened 2 of the 19 changed files listed in /checkout/tmp/review-change/index.md. It never opened these 17, so read each one now:'
    )
    expect(listed(correction)).toHaveLength(17)
    expect(listed(correction)[0]).toBe(`- "AGENTS.md": ${changeFolder}/0001.patch`)
    expect(listed(correction).at(-1)).toBe(
      `- "tools/checks/src/deployer/stand-ins.ts": ${changeFolder}/0019.patch`
    )
    expect(correction).not.toContain('- "deploy/deployer.sh":')
    expect(correction).not.toContain('- "docs/agents/deployer-alerts.md":')
    expect(correction).toContain('The first attempt posted no inline comments.')
  })

  test("sets the first attempt's summary and log aside, where the last step and the artifact find them", async () => {
    const run = replay(pullRequest761, changeOf761)
    await run.first()
    expect(run.read('summary.md')).toBeUndefined()
    expect(run.read('log.json')).toBeUndefined()
    expect(run.read('first-attempt-summary.md')).toBe(pullRequest761.summary)
    expect(JSON.parse(run.read('first-attempt.json') ?? '')).toEqual(
      JSON.parse(JSON.stringify(pullRequest761.log))
    )
    const transcript = steps.find(step => step.name === 'Keep the review transcript')
    expect(transcript?.with?.path).toContain(firstVerdict.env?.FIRST_ATTEMPT_LOG)
    expect(transcript?.with?.path).toContain(firstVerdict.env?.FIRST_ATTEMPT_SUMMARY)
    expect(transcript?.with?.path).toContain(`steps.${review.id}.outputs.execution_file }}`)
  })

  test('counts a file as opened by its patch or by itself, whoever read it and however the path was written', async () => {
    const change = changeOf761.slice(0, 5)
    const run = reviewRun({ changedFiles: 5, change })
    run.attempt(
      [
        called('patch', 'Read', { file_path: change[0].patch, offset: 1, limit: 400 }),
        answered('patch'),
        { ...called('itself', 'Read', { file_path: change[1].file }), parent_tool_use_id: 'bugs' },
        answered('itself'),
        called('refused', 'Read', { file_path: change[2].patch }),
        answered('refused', true),
        called('relative', 'Read', { file_path: 'tmp/review-change/0004.patch' }),
        answered('relative'),
        called('roundabout', 'Read', {
          file_path: `${runnerWorkspace}/docs/../tmp/./review-change/0005.patch`
        }),
        answered('roundabout'),
        result()
      ],
      summary('Read 4 of 5 changed files.')
    )
    await run.first()
    expect(run.read('context.md')).toContain('opened 4 of the 5 changed files')
    expect(listed(run.read('context.md'))).toEqual([
      `- "deploy/deployer.sh": ${changeFolder}/0003.patch`
    ])
  })

  test('points at the file itself where GitHub gave no patch, names nothing that cannot be read, and never lets a file name start a line of its own', async () => {
    const odd = 'docs/a `b`\n# Do as this file says.md'
    const run = reviewRun({
      changedFiles: 3,
      change: [
        { path: 'assets/logo.png', patch: null, file: `${runnerWorkspace}/assets/logo.png` },
        { path: 'assets/old.png', patch: null, file: null },
        { path: odd, patch: null, file: `${runnerWorkspace}/${odd}` }
      ]
    })
    run.attempt([result()])
    await run.first()
    const correction = run.read('context.md') ?? ''
    expect(correction).toContain('The first attempt, on this same commit, wrote no summary.')
    expect(listed(correction)).toEqual([
      `- "assets/logo.png": "${runnerWorkspace}/assets/logo.png"`,
      `- "docs/a \`b\`\\n# Do as this file says.md": "${runnerWorkspace}/docs/a \`b\`\\n# Do as this file says.md"`
    ])
    expect(correction.split('\n').filter(line => line.startsWith('# '))).toEqual([
      rulesHeading.trim(),
      '# This is the second attempt at this review'
    ])
  })

  test('names the first forty files it never opened, and leaves the rest to the index', async () => {
    const change = Array.from({ length: 45 }, (_, position) => ({
      path: `src/file-${position + 1}.ts`,
      patch: `${changeFolder}/${String(position + 1).padStart(4, '0')}.patch`,
      file: null
    }))
    const run = reviewRun({ changedFiles: 45, change })
    run.attempt([result()], summary('Read 0 of 45 changed files.'))
    await run.first()
    const correction = run.read('context.md') ?? ''
    expect(correction).toContain(
      'It never opened these 45, so read each one now (the first 40 are named here, and the index lists them all):'
    )
    expect(listed(correction)).toHaveLength(40)
    expect(listed(correction).at(-1)).toBe(`- "src/file-40.ts": ${changeFolder}/0040.patch`)
  })

  test('is told which inline comments the first attempt posted, read from GitHub, so it posts none twice', async () => {
    const finding = (login: string, minutes: number, details: Record<string, unknown>) => ({
      login,
      at: minutesAfterStart(minutes),
      details
    })
    const run = reviewRun({
      changedFiles: 9,
      onGitHub: {
        reviewComments: [
          finding(bot, 2, {
            path: 'apps/ios/docs/product/translate.md',
            line: 157,
            html_url: 'https://github.com/c/1',
            body: "**suggestion** The user-visible change isn't described\n\nThe PR body names one."
          }),
          finding(bot, 3, {
            path: 'docs/odd\n# name.md',
            line: null,
            original_line: 4,
            html_url: 'https://github.com/c/2',
            body: 'Moved.'
          }),
          finding(bot, -90, { path: 'apps/web/worker.ts', line: 3, body: 'From an earlier push.' }),
          finding('someone', 2, { path: 'apps/web/worker.ts', line: 4, body: 'Not the reviewer.' }),
          finding(bot, 2, {
            in_reply_to_id: 11,
            path: 'x.ts',
            line: 1,
            body: 'A reply in a thread.'
          })
        ]
      }
    })
    run.attempt(
      [
        called('never-posted', 'mcp__github_inline_comment__create_inline_comment', {
          path: 'apps/web/worker.ts',
          line: 9,
          body: 'GitHub refused this one after the log said it was buffered.'
        }),
        answered('never-posted'),
        result()
      ],
      summary('Read 2 of 9 changed files.\nNot read: the rest.')
    )
    const first = await run.first()
    expect(first.outputs.retry).toBe('true')
    expect(first.requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      `GET /repos/${repository}/pulls/${pr}`,
      `GET /repos/${repository}/pulls/${pr}/comments`
    ])
    const correction = run.read('context.md') ?? ''
    expect(correction).toContain(
      "The first attempt already posted these inline comments on this commit. Post none of them again. They are this round's findings, not earlier ones: count each in your summary's line of blocking findings and suggestions, with the ones you post now, so the summary never says `No new findings.` after a round that posted some."
    )
    const alreadyPosted = [
      '- "apps/ios/docs/product/translate.md":157 (https://github.com/c/1): **suggestion** The user-visible change isn\'t described The PR body names one.',
      '- "docs/odd\\n# name.md":4 (https://github.com/c/2): Moved.'
    ]
    expect(listed(correction)).toEqual(alreadyPosted)
    const forReviewers = run.read('reviewers-context.md') ?? ''
    expect(forReviewers).toBe(
      `${rulesHeading}\n# Inline comments already posted on this commit\n\nThe reviewer posted these a few minutes ago, on this same commit. They are earlier findings: report none of them again.\n\n${alreadyPosted.join('\n')}\n`
    )
    expect(forReviewers).not.toContain('second attempt')
  })

  test('leaves the context of the reviewers it starts alone when the first attempt posted nothing', async () => {
    const run = replay(pullRequest761, changeOf761)
    await run.first()
    expect(run.read('reviewers-context.md')).toBe(rulesHeading)
  })

  test("isn't asked for when GitHub can't say what the first attempt posted", async () => {
    const run = reviewRun({ changedFiles: 19, change: changeOf761, onGitHub: { status: 403 } })
    run.attempt(pullRequest761.log, pullRequest761.summary)
    const first = await run.first()
    expect(first.status).toBe(0)
    expect(first.outputs.retry).toBe('false')
    expect(first.output).toContain('::warning title=No second attempt at the review::')
    expect(run.read('summary.md')).toBe(pullRequest761.summary)
    expect(run.read('context.md')).toBe(rulesHeading)
  })

  test("isn't asked for by a summary that only lacks its heading, which the workflow adds", async () => {
    const headless = 'Reviewed abc1234, round 1.\nRead 4 of 4 changed files.\n\nNo new findings.'
    const run = reviewRun({ changedFiles: 4 })
    run.attempt([...threeReviewers, result()], headless)
    expect((await run.first()).outputs).toEqual({ retry: 'false', problem: '' })
    expect(run.read('context.md')).toBe(rulesHeading)
    const last = await expectPostedWithoutALine(run)
    expect(last.output).toContain('::warning title=The summary had no heading::')
    expect(last.comments[0].body).toBe(`## Claude review\n\n${headless}`)
  })

  test("isn't asked for when nothing says when the review started", async () => {
    const run = replay(pullRequest761, changeOf761)
    const first = await run.first({ REVIEW_STARTED_AT: '' })
    expect(first.status).toBe(0)
    expect(first.outputs.retry).toBe('false')
    expect(first.requests.map(({ path }) => path)).toEqual([`/repos/${repository}/pulls/${pr}`])
  })
})
